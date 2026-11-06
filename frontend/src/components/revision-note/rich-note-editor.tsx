"use client";

// The revision note's editor (PBI-34, subtask 34.2), on Tiptap as the prototype simulates it.
// Only the formatting AC 1 names is switched on, so the toolbar is the editor's whole vocabulary.

import { useEffect, useId, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount } from "@tiptap/extensions";
import { CharLimit } from "@/components/ui/char-limit";

/** What the form reads from the editor on every change. */
export interface RichNote {
  html: string;
  // The text without its formatting: what AC 2 counts.
  text: string;
  length: number;
}

export interface RichNoteEditorProps {
  label: string;
  max: number;
  initialContent?: string;
  disabled?: boolean;
  onChange?: (note: RichNote) => void;
}

// StarterKit's other blocks (headings, quotes, code, rules, strike, underline) stay off.
// Link is switched on with its own rules in the next step.
const FORMATTING = StarterKit.configure({
  heading: false,
  blockquote: false,
  code: false,
  codeBlock: false,
  horizontalRule: false,
  strike: false,
  underline: false,
  link: false,
});

type Mark = "bold" | "italic" | "bulletList" | "orderedList";

interface Tool {
  mark: Mark;
  label: string;
  text: ReactNode;
  run: (editor: Editor) => void;
}

// The prototype's toolbar, in its order: label for screen readers, text on the button.
const TOOLS: readonly Tool[] = [
  { mark: "bold", label: "Tebal", text: <b>B</b>, run: (e) => e.chain().focus().toggleBold().run() },
  { mark: "italic", label: "Miring", text: <i>I</i>, run: (e) => e.chain().focus().toggleItalic().run() },
  {
    mark: "bulletList",
    label: "Daftar poin",
    text: "• Poin",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    mark: "orderedList",
    label: "Daftar nomor",
    text: "1. Nomor",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
];

const FRAME = "rounded-(--radius-control) border border-rule bg-surface";

const TOOL_BUTTON =
  "rounded-md px-2.5 py-1 text-[12.5px] text-ink hover:bg-surface-2 aria-pressed:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

function noteOf(editor: Editor): RichNote {
  return {
    html: editor.getHTML(),
    text: editor.getText(),
    length: editor.storage.characterCount.characters(),
  };
}

export function RichNoteEditor({
  label,
  max,
  initialContent = "",
  disabled = false,
  onChange,
}: Readonly<RichNoteEditorProps>) {
  const countId = useId();
  const editor = useEditor({
    extensions: [FORMATTING, CharacterCount.configure({ limit: max })],
    content: initialContent,
    editable: !disabled,
    // Rendered on the client only, so the server's HTML and the browser's never disagree.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        "aria-describedby": countId,
        class:
          "min-h-[150px] max-h-[55vh] overflow-auto px-3 py-2.5 text-[13px] leading-normal text-ink outline-none [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-1.5 [&_ul]:ml-5 [&_ul]:list-disc",
      },
    },
    onUpdate: ({ editor: changed }) => onChange?.(noteOf(changed)),
  });

  // Tiptap builds the editor after the first render; until then the box keeps its place.
  if (!editor) return <div className={`${FRAME} min-h-[190px]`} aria-hidden="true" />;
  return <ReadyEditor editor={editor} disabled={disabled} max={max} countId={countId} />;
}

interface ReadyEditorProps {
  editor: Editor;
  disabled: boolean;
  max: number;
  countId: string;
}

// The editor once Tiptap has built it, so nothing below has to ask whether it exists yet.
function ReadyEditor({ editor, disabled, max, countId }: Readonly<ReadyEditorProps>) {
  // Locks the text as well as the toolbar while the form is sending.
  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      active: Object.fromEntries(
        TOOLS.map((tool) => [tool.mark, current.isActive(tool.mark)]),
      ) as Record<Mark, boolean>,
      length: current.storage.characterCount.characters(),
    }),
  });

  return (
    <div className="flex flex-col gap-1">
      <div className={FRAME}>
        <div className="flex flex-wrap items-center gap-0.5 border-b border-rule px-1.5 py-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.mark}
              type="button"
              aria-label={tool.label}
              title={tool.label}
              aria-pressed={state.active[tool.mark]}
              disabled={disabled}
              // Keeps the selection in the text, so the format lands on what was selected.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => tool.run(editor)}
              className={TOOL_BUTTON}
            >
              {tool.text}
            </button>
          ))}
          <button
            type="button"
            aria-label="Tambah link"
            title="Tambah link"
            disabled={disabled}
            className={TOOL_BUTTON}
          >
            Link
          </button>
        </div>
        <EditorContent editor={editor} />
      </div>
      <CharLimit id={countId} length={state.length} max={max} />
    </div>
  );
}
