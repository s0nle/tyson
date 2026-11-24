import type { GraphView } from "@/contract";
import type { Db } from "../db";
import type { Org } from "./base";

type Label = GraphView["nodes"][number]["label"];

/** Native-graph-style store on Postgres: labeled nodes + typed directional edges. */
export async function upsertNode(db: Db, org: Org, id: string, label: Label, name: string, props: Record<string, unknown> = {}) {
  await db.query(
    `insert into nodes (org_id, id, label, name, props) values ($1, $2, $3, $4, $5::text::jsonb)
     on conflict (org_id, id) do update set label = excluded.label, name = excluded.name, props = excluded.props`,
    [org.id, id, label, name, JSON.stringify(props)],
  );
}

export async function upsertEdge(db: Db, org: Org, src: string, rel: string, dst: string, props: Record<string, unknown> = {}) {
  await db.query(
    `insert into edges (org_id, src, rel, dst, props) values ($1, $2, $3, $4, $5::text::jsonb)
     on conflict (org_id, src, rel, dst) do update set props = excluded.props`,
    [org.id, src, rel, dst, JSON.stringify(props)],
  );
}

export async function clearRel(db: Db, org: Org, rel: string) {
  await db.query("delete from edges where org_id = $1 and rel = $2", [org.id, rel]);
}

export interface Candidate {
  service: string;
  scope: string;
  noticeNode: string;
  bidderNode: string;
  projectNode: string;
  strength: string;
}

/**
 * The traversal from the build guide, in SQL over the edge table:
 *   (supplier)-[:OFFERS]->(service)-[:MATCHES]->(scope)<-[:REQUESTS]-(notice)
 *   (notice)-[:ISSUED_BY]->(bidder), (notice)-[:FOR_PROJECT]->(project)
 *   WHERE notice.is_current
 */
export async function matchCandidates(db: Db, org: Org, supplierNode: string, noticeNode?: string): Promise<Candidate[]> {
  return db.query<Candidate>(
    `select sv.name as service, sc.name as scope, rq.src as "noticeNode", ib.dst as "bidderNode", fp.dst as "projectNode",
            coalesce(m.props->>'strength', 'trade_level') as strength
       from edges o
       join nodes sv on sv.org_id = o.org_id and sv.id = o.dst
       join edges m  on m.org_id = o.org_id and m.src = o.dst and m.rel = 'MATCHES'
       join nodes sc on sc.org_id = o.org_id and sc.id = m.dst
       join edges rq on rq.org_id = o.org_id and rq.dst = m.dst and rq.rel = 'REQUESTS'
       join nodes nt on nt.org_id = o.org_id and nt.id = rq.src and (nt.props->>'isCurrent')::boolean = true
       join edges ib on ib.org_id = o.org_id and ib.src = rq.src and ib.rel = 'ISSUED_BY'
       join edges fp on fp.org_id = o.org_id and fp.src = rq.src and fp.rel = 'FOR_PROJECT'
      where o.org_id = $1 and o.src = $2 and o.rel = 'OFFERS' ${noticeNode ? "and rq.src = $3" : ""}`,
    noticeNode ? [org.id, supplierNode, noticeNode] : [org.id, supplierNode],
  );
}

/** Lead-scoped subgraph: service → scope → notice → bidder/person/deadline → project ← owner. */
export async function subgraphForNotice(db: Db, org: Org, noticeNode: string, supplierNode: string): Promise<GraphView> {
  const edges = await db.query<{ src: string; rel: string; dst: string }>(
    `with n as (select $2::text as id)
     select src, rel, dst from edges where org_id = $1 and (src = (select id from n) or dst = (select id from n))
     union
     select e.src, e.rel, e.dst from edges e
       join edges r on r.org_id = e.org_id and r.src = $2 and r.rel = 'REQUESTS' and e.dst = r.dst and e.rel = 'MATCHES'
      where e.org_id = $1
     union
     select e.src, e.rel, e.dst from edges e
       join edges f on f.org_id = e.org_id and f.src = $2 and f.rel = 'FOR_PROJECT' and e.dst = f.dst
      where e.org_id = $1 and e.rel = 'OWNS'
     union
     select e.src, e.rel, e.dst from edges e
       join edges p on p.org_id = e.org_id and p.src = $2 and p.rel = 'NAMES_CONTACT' and e.src = p.dst
      where e.org_id = $1 and e.rel = 'WORKS_AT'`,
    [org.id, noticeNode],
  );
  // keep only MATCHES edges from this supplier's services, and the matched scopes
  const offered = new Set(
    (await db.query<{ dst: string }>("select dst from edges where org_id = $1 and src = $2 and rel = 'OFFERS'", [org.id, supplierNode])).map((r) => r.dst),
  );
  const matched = edges.filter((e) => e.rel === "MATCHES" && offered.has(e.src));
  const matchedScopes = new Set(matched.map((e) => e.dst));
  const keep = edges.filter((e) => (e.rel === "MATCHES" ? offered.has(e.src) : e.rel === "REQUESTS" ? matchedScopes.has(e.dst) : true));
  const ids = [...new Set(keep.flatMap((e) => [e.src, e.dst]))];
  const nodes = ids.length
    ? await db.query<GraphView["nodes"][number]>(
        `select id, label, name, props from nodes where org_id = $1 and id = any($2::text[])`,
        [org.id, ids],
      )
    : [];
  return { nodes, edges: keep.map((e) => ({ from: e.src, to: e.dst, rel: e.rel })) };
}

export async function wholeGraph(db: Db, org: Org): Promise<GraphView> {
  const nodes = await db.query<GraphView["nodes"][number]>("select id, label, name, props from nodes where org_id = $1 limit 400", [org.id]);
  const edges = await db.query<{ src: string; rel: string; dst: string }>("select src, rel, dst from edges where org_id = $1 limit 800", [org.id]);
  return { nodes, edges: edges.map((e) => ({ from: e.src, to: e.dst, rel: e.rel })) };
}
