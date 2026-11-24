"use client";
import { useId, useRef, useState } from "react";
import { Icon } from "./ui";

export function HoverAccordion({
  title,
  meta,
  children,
  tone = "",
  className = "",
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focused, setFocused] = useState(false);
  const id = useId();
  const open = hovered || pinned || focused;
  return (
    <section
      className={`hover-accordion ${open ? "expanded" : ""} ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setPinned(false);
          setHovered(false);
          setFocused(false);
        }
      }}
    >
      <button
        type="button"
        className="accordion-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setPinned((v) => !v);
          setFocused(false);
          setHovered(false);
        }}
      >
        <span className="accordion-title">{title}</span>
        {meta && <span className={`accordion-meta ${tone}`}>{meta}</span>}
        <span className="accordion-chevron">
          <Icon name="chevron" size={15} />
        </span>
      </button>
      <div id={id} className="accordion-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
export function BusinessDrawer({
  open,
  onOpen,
  onClose,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const expanded = open || hovered;
  return (
    <div
      className="business-drawer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setHovered(false);
          onClose();
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`business-trigger ${expanded ? "active" : ""}`}
        aria-expanded={expanded}
        aria-controls="business-drawer-panel"
        onClick={() => {
          setHovered(false);
          if (open) onClose();
          else onOpen();
        }}
      >
        <Icon name="profile" size={19} />
        <span>Your business</span>
        <Icon name="chevron" size={15} />
      </button>
      <section
        id="business-drawer-panel"
        className={`business-drawer-panel ${expanded ? "open" : ""}`}
        aria-label="Your business and buyer profile"
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <header className="drawer-header">
          <div>
            <p className="eyebrow">YOUR BUSINESS</p>
            <h2>Buyer profile</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close business panel"
            onClick={() => {
              onClose();
              setHovered(false);
              trigger.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer-scroll">{children}</div>
      </section>
    </div>
  );
}
