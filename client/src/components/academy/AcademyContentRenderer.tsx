import type { AcademyContentBlock } from "@/academy/catalog";

export function AcademyContentRenderer({ blocks }: { blocks?: AcademyContentBlock[] }) {
  if (!blocks?.length) {
    return (
      <div className="rounded-2xl border border-white/[0.09] bg-[#050505]/70 p-6 sm:p-8">
        <p className="text-sm leading-7 text-[#9ca3af]">Lesson content is being prepared.</p>
        <p className="mt-2 text-xs leading-6 text-[#737b88]">Curriculum metadata remains available above and in the course navigation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[15px] leading-8 text-[#c4cad4]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = block.level === 3 ? "h3" : "h2";
          return <Heading key={index} className="pt-2 text-xl font-semibold tracking-[-0.02em] text-white">{block.text}</Heading>;
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5 marker:text-[#ff6f6f]">
              {block.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          );
        }
        if (block.type === "callout") {
          return (
            <aside key={index} className="rounded-xl border border-[#ff3b3b]/25 bg-[#ff3b3b]/[0.06] p-5">
              {block.title ? <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff9c9c]">{block.title}</div> : null}
              <p className={block.title ? "mt-2" : undefined}>{block.text}</p>
            </aside>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}
