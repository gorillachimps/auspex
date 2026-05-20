import type { ReactNode } from "react";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";

type Props = {
  title: string;
  updated: string;
  children: ReactNode;
};

/**
 * Shared layout for static legal/trust pages. Anchored title, "last
 * updated" stamp, prose styling consistent with /docs.
 */
export function LegalPage({ title, updated, children }: Props) {
  return (
    <>
      <TopNav />
      <main id="main" className="flex-1">
        <article className="mx-auto max-w-[760px] px-4 py-10">
          <header className="border-b border-border pb-4">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-1 text-[11px] text-muted-2">Last updated {updated}</p>
          </header>
          <div className="prose-narrow mt-6 text-[14px] leading-relaxed text-foreground/90 [&_a]:text-accent [&_a]:underline [&_a:hover]:text-foreground [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:my-3 [&_p]:text-muted [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_li]:text-muted [&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:text-foreground">
            {children}
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
