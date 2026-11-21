"use client";

// The revision note's editor (PBI-34, subtask 34.2), on Tiptap as the prototype simulates it.
// Only the formatting AC 1 names is switched on, so the toolbar is the editor's whole vocabulary.

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type Ref,
} from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { NOTE_IMAGE_REMOVE, NoteImage } from "./note-image-node";

/** What the form reads from the editor on every change. */
export interface RichNote {
  html: string;
  // The text without its formatting: what AC 2 counts.
  text: string;
  length: number;
}

/** What a form can ask of the editor: place a stored screenshot in the text, or take it out. */
export interface RichNoteEditorHandle {
  /** Places the image at the cursor, without taking focus from wherever the writer is. */
  insertImage: (imageId: string) => void;
  /** Takes every place the image holds out of the text. */
  removeImage: (imageId: string) => void;
}

export interface RichNoteEditorProps {
  /** Where the handle goes; the screenshots' form uses it to place each upload in the text. */
  editorRef?: Ref<RichNoteEditorHandle>;
  /** Called with the id when the writer presses × on an image in the text. */
  onRemoveImage?: (imageId: string) => void;
  label: string;
  max: number;
  initialContent?: string;
  disabled?: boolean;
  onChange?: (note: RichNote) => void;
  // Where pasted and dropped files go (the screenshot list); without it the editor takes none.
  onFiles?: (files: File[]) => void;
  // The hint on the empty note.
  placeholder?: string;
  // What the form's textarea did, kept when the editor takes its place: the focus on opening,
  // required and invalid for screen readers, the form's message read with the counter, and
  // knowing when the Admin leaves the note.
  autoFocus?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onBlur?: () => void;
  // What else the editor holds, laid out as the prototype: a control at the toolbar's end,
  // attachments inside the frame under the text, and a line beside the counter.
  toolbarEnd?: ReactNode;
  attachments?: ReactNode;
  footer?: ReactNode;
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

// Tiptap's own base rules for the text (from its style.ts), as classes: spaces and line breaks
// kept as typed, long words wrapped, no ligatures that would join letters the caret moves between.
// Its gap-cursor and hidden-selection rules are left out: they serve blocks this editor turns off.
const EDITOR_TEXT =
  "relative whitespace-pre-wrap [white-space:break-spaces] break-words [font-variant-ligatures:none] [font-feature-settings:'liga'_0] [&_[contenteditable=false]]:whitespace-normal [&_img.ProseMirror-separator]:!inline [&_img.ProseMirror-separator]:!size-0 [&_img.ProseMirror-separator]:!border-0 [&_img.ProseMirror-separator]:!m-0";

const TOOL_BUTTON =
  "rounded-md px-2.5 py-1 text-[12.5px] text-ink hover:bg-surface-2 aria-pressed:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

// The files a clipboard or a drop carries; none when it carries no list at all.
function filesIn(transfer: DataTransfer | null): File[] {
  return Array.from(transfer?.files ?? []);
}

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

// The text area's look: Tiptap's base rules, the lists, and the placeholder on an empty note.
const EDITOR_CLASS = `${EDITOR_TEXT} [&_a]:text-accent-deep [&_a]:underline min-h-[150px] max-h-[55vh] overflow-auto px-3 py-2.5 text-[13px] leading-normal text-ink outline-none [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-1.5 [&_ul]:ml-5 [&_ul]:list-disc [&_.is-editor-empty]:before:pointer-events-none [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:h-0 [&_.is-editor-empty]:before:text-muted [&_.is-editor-empty]:before:content-[attr(data-placeholder)]`;

function noteOf(editor: Editor): RichNote {
  return {
    html: editor.getHTML(),
    text: editor.getText(),
    length: editor.storage.characterCount.characters(),
  };
}

export function RichNoteEditor({
  editorRef,
  onRemoveImage,
  label,
  max,
  initialContent = "",
  disabled = false,
  onChange,
  onFiles,
  placeholder,
  toolbarEnd,
  attachments,
  footer,
  autoFocus = false,
  required = false,
  invalid,
  describedBy,
  onBlur,
}: Readonly<RichNoteEditorProps>) {
  const countId = useId();
  // The field's own attributes; kept in step with the form below, since invalid changes once the
  // Admin has left an empty note.
  const fieldAttributes = {
    role: "textbox",
    "aria-multiline": "true",
    "aria-label": label,
    "aria-describedby": describedBy ? `${describedBy} ${countId}` : countId,
    ...(required ? { "aria-required": "true" } : {}),
    // Said only when the form says it, either way, as the form's textarea did.
    ...(invalid === undefined ? {} : { "aria-invalid": String(invalid) }),
    // Said by screen readers; data-placeholder on the empty paragraph draws it on the page.
    ...(placeholder ? { "aria-placeholder": placeholder } : {}),
    class: EDITOR_CLASS,
  };
  const editor = useEditor({
    // The app's CSP refuses a <style> tag without its nonce, so Tiptap injects none; the rules it
    // would bring are in EDITOR_TEXT, compiled into the app's own stylesheet (OWASP A02).
    injectCSS: false,
    extensions: [
      FORMATTING,
      NoteImage,
      CharacterCount.configure({ limit: max }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    editable: !disabled,
    // Rendered on the client only, so the server's HTML and the browser's never disagree.
    immediatelyRender: false,
    editorProps: {
      handlePaste: (view, event) => {
        // A pasted file is a screenshot for the list, never part of the text.
        const files = filesIn(event.clipboardData);
        if (files.length === 0) return pasteAsPlainText(view, event);
        onFiles?.(files);
        return true;
      },
      handleDOMEvents: {
        // Taken before ProseMirror places the drop, so a dropped file never lands in the text.
        drop: (_view, event) => {
          const files = filesIn(event.dataTransfer);
          if (files.length === 0) return false;
          event.preventDefault();
          onFiles?.(files);
          return true;
        },
      },
      attributes: fieldAttributes,
    },
    autofocus: autoFocus ? "end" : false,
    onBlur: () => onBlur?.(),
    onUpdate: ({ editor: changed }) => onChange?.(noteOf(changed)),
  });

  useImperativeHandle(
    editorRef,
    () => ({
      insertImage: (imageId) => {
        // With a paragraph after it, so the cursor lands there and the next words typed or pasted
        // go on below the image instead of replacing it.
        editor?.commands.insertContent([{ type: "noteImage", attrs: { imageId } }, { type: "paragraph" }]);
      },
      removeImage: (imageId) => {
        if (!editor) return;
        // From the end, so a removal never moves the places still to be visited.
        const places: number[] = [];
        editor.state.doc.descendants((node, position) => {
          if (node.type.name === "noteImage" && node.attrs.imageId === imageId) places.push(position);
        });
        if (places.length === 0) return;
        const { tr } = editor.state;
        for (const position of places.reverse()) tr.delete(position, position + 1);
        editor.view.dispatch(tr);
      },
    }),
    [editor],
  );

  const attributesKey = JSON.stringify(fieldAttributes);
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: { ...editor.options.editorProps, attributes: JSON.parse(attributesKey) },
    });
  }, [editor, attributesKey]);

  // Tiptap builds the editor after the first render; until then the box keeps its place.
  if (!editor) return <div className={`${FRAME} min-h-[190px]`} aria-hidden="true" />;
  return (
    <ReadyEditor
      editor={editor}
      disabled={disabled}
      max={max}
      countId={countId}
      acceptsFiles={onFiles !== undefined}
      onRemoveImage={onRemoveImage}
      label={label}
      toolbarEnd={toolbarEnd}
      attachments={attachments}
      footer={footer}
    />
  );
}

interface ReadyEditorProps {
  editor: Editor;
  disabled: boolean;
  max: number;
  countId: string;
  acceptsFiles: boolean;
  onRemoveImage?: (imageId: string) => void;
  label: string;
  toolbarEnd: ReactNode;
  attachments: ReactNode;
  footer: ReactNode;
}

// The editor once Tiptap has built it, so nothing below has to ask whether it exists yet.
function ReadyEditor({
  editor,
  disabled,
  max,
  countId,
  acceptsFiles,
  onRemoveImage,
  label,
  toolbarEnd,
  attachments,
  footer,
}: Readonly<ReadyEditorProps>) {
  const frame = useRef<HTMLDivElement>(null);

  // An image's × asks its owner to delete it; the answer is whatever the form passes now.
  useEffect(() => {
    const element = frame.current;
    if (!element || !onRemoveImage) return;
    const listener = (event: Event) => onRemoveImage((event as CustomEvent<string>).detail);
    element.addEventListener(NOTE_IMAGE_REMOVE, listener);
    return () => element.removeEventListener(NOTE_IMAGE_REMOVE, listener);
  }, [onRemoveImage]);

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
  const linkButton = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);

  // Only a file is offered somewhere to land; dragged words go on into the text as before.
  const offersFile = (event: DragEvent<HTMLDivElement>) =>
    acceptsFiles && event.dataTransfer.types.includes("Files");

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={frame}
        className={`${FRAME} outline-offset-2 data-[dragging=true]:outline-2 data-[dragging=true]:outline-dashed data-[dragging=true]:outline-ink`}
        data-dragging={dragging}
        onDragEnter={(event) => {
          if (offersFile(event)) setDragging(true);
        }}
        onDragOver={(event) => {
          if (offersFile(event)) event.preventDefault();
        }}
        // Leaving for the toolbar or the text inside is not leaving the editor.
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={() => setDragging(false)}
      >
        <div
          role="toolbar"
          aria-label={`Format ${label.toLowerCase()}`}
          className="flex flex-wrap items-center gap-0.5 border-b border-rule px-1.5 py-1"
        >
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
            ref={linkButton}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setLinkOpen((open) => !open)}
            className={TOOL_BUTTON}
          >
            Link
          </button>
          {toolbarEnd ? (
            // One group, so a narrow toolbar wraps the divider together with what it sets apart.
            <span className="inline-flex items-center gap-0.5">
              <span role="separator" aria-orientation="vertical" className="mx-1 h-4 w-px bg-rule" />
              {toolbarEnd}
            </span>
          ) : null}
        </div>
        {linkOpen ? (
          <LinkRow
            editor={editor}
            onDone={() => setLinkOpen(false)}
            onCancel={() => {
              setLinkOpen(false);
              linkButton.current?.focus();
            }}
          />
        ) : null}
        <EditorContent editor={editor} />
        {attachments}
      </div>
      <div data-note-footer className="flex items-center justify-between gap-3 text-xs">
        {footer}
        <CharLimit id={countId} length={state.length} max={max} />
      </div>
    </div>
  );
}

interface LinkRowProps {
  editor: Editor;
  onDone: () => void;
  /** Escape: the row closes without a link and focus goes back to the Link button. */
  onCancel: () => void;
}

// The address row under the toolbar. It is unmounted when it closes, so a new link always starts
// from an empty address and no refusal left over.
function LinkRow({ editor, onDone, onCancel }: Readonly<LinkRowProps>) {
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
          // The row opens to be typed in; the Link button that opened it keeps no other job.
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            } else if (event.key === "Escape") {
              // Kept from the panel, which would otherwise close and lose the note.
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          placeholder="https://…"
          value={address}
          aria-invalid={error !== null}
          onChange={(event) => {
            setAddress(event.target.value);
            setError(null);
          }}
          className="min-w-0 flex-1 rounded-(--radius-control) border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink aria-invalid:border-red"
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
