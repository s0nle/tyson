import { redirect } from "next/navigation";
export default async function LeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  redirect(`/?lead=${encodeURIComponent(leadId)}`);
}
