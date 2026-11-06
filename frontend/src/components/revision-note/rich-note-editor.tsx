"use client";

// The revision note's editor (PBI-34, subtask 34.2), on Tiptap as the prototype simulates it.
// Only the formatting AC 1 names is switched on, so the toolbar is the editor's whole vocabulary.

import { useEffect, useId, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount } from "@tiptap/extensions";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { Button } from "@/components/ui/button";
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

/** The one message a refused link address gets, worded as the prototype does. */
export const LINK_ADDRESS_INVALID = "Link harus diawali http:// atau https://";

// How long a refusal stays on screen, as the prototype shows it.
const MESSAGE_MS = 3500;

// http or https and an address after it, with no space: the prototype's own check. Anything
// else, javascript: above all, would run a script or leave the web on a click (OWASP A05).
const WEB_ADDRESS = /^https?:\/\/\S+$/i;

// StarterKit's other blocks (headings, quotes, code, rules, strike, underline) stay off.
const FORMATTING = StarterKit.configure({
  heading: false,
  blockquote: false,
  code: false,
  codeBlock: false,
  horizontalRule: false,
  strike: false,
  underline: false,
  // A link that arrives any other way (in content, on paste, typed) passes the same check.
  link: { openOnClick: false, isAllowedUri: (url) => WEB_ADDRESS.test(url) },
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

// A paste from a web page brings its HTML. Only its plain-text twin goes in, one paragraph a
// line, so the page's styling, links, images and scripts never reach the note (AC 1, OWASP A05).
// A plain paste is left to ProseMirror, which already keeps each line and adds no styling.
function pasteAsPlainText(view: EditorView, event: ClipboardEvent): boolean {
  const data = event.clipboardData;
  if (!data?.types.includes("text/html")) return false;

  const { schema } = view.state;
  const lines = data.getData("text/plain").split(/\r\n?|\n/);
  const paragraphs = lines.map((line) =>
    schema.nodes.paragraph.create(null, line ? schema.text(line) : undefined),
  );
  // Marked as a paste, so CharacterCount cuts it at the limit instead of refusing it.
  view.dispatch(
    view.state.tr
      .replaceSelection(new Slice(Fragment.from(paragraphs), 1, 1))
      .setMeta("paste", true),
  );
  return true;
}

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
      handlePaste: (view, event) => pasteAsPlainText(view, event),
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

  const [linkOpen, setLinkOpen] = useState(false);

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
            aria-expanded={linkOpen}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setLinkOpen((open) => !open)}
            className={TOOL_BUTTON}
          >
            Link
          </button>
        </div>
        {linkOpen ? <LinkRow editor={editor} onDone={() => setLinkOpen(false)} /> : null}
        <EditorContent editor={editor} />
      </div>
      <CharLimit id={countId} length={state.length} max={max} />
    </div>
  );
}

interface LinkRowProps {
  editor: Editor;
  onDone: () => void;
}

// The address row under the toolbar. It is unmounted when it closes, so a new link always starts
// from an empty address and no refusal left over.
function LinkRow({ editor, onDone }: Readonly<LinkRowProps>) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A refusal steps back after a few seconds, as the prototype's does.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [error]);

  function apply() {
    const href = address.trim();
    if (!WEB_ADDRESS.test(href)) {
      setError(LINK_ADDRESS_INVALID);
      return;
    }
    const chain = editor.chain().focus();
    // Selected words become the link's text; with none, the address itself goes in, then a space
    // so the next words typed are not part of the link.
    if (editor.state.selection.empty) {
      chain
        .insertContent([
          { type: "text", text: href, marks: [{ type: "link", attrs: { href } }] },
          { type: "text", text: " " },
        ])
        .run();
    } else {
      chain.extendMarkRange("link").setLink({ href }).run();
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-1 border-b border-rule p-1.5">
      <div className="flex gap-1.5">
        <input
          type="url"
          aria-label="URL link"
          placeholder="https://…"
          value={address}
          aria-invalid={error !== null}
          onChange={(event) => {
            setAddress(event.target.value);
            setError(null);
          }}
          className="flex-1 rounded-md border border-rule px-2.5 py-1.5 text-[12.5px] text-ink"
        />
        <Button onClick={apply}>Terapkan</Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
