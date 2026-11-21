// A screenshot placed in a revision note's text (PBI-34): a block that names a stored image by id.
// The page shows it through the app's own route; the note carries the id and nothing else, so no
// address of the writer's choosing can reach the creator's browser (OWASP A05).

import { mergeAttributes, Node } from "@tiptap/core";
import { noteImageSrc } from "@/lib/revision-note-images";

/**
 * What an image's × says: bubbled up from the image with its id, for the editor's owner to answer
 * (the form deletes the image for good), so the node holds no callback of its own.
 */
export const NOTE_IMAGE_REMOVE = "note-image-remove";

export const NoteImage = Node.create({
  name: "noteImage",
  group: "block",
  // One unit: the caret steps over it, and it is selected, moved or deleted whole.
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      imageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-id"),
        renderHTML: (attributes) => (attributes.imageId ? { "data-image-id": attributes.imageId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-image-id]" }];
  },

  // What the note carries: the id only. The picture in the editor is drawn by the node view below.
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ({ node, editor }) => {
      const imageId = String(node.attrs.imageId);
      const wrapper = document.createElement("div");
      wrapper.draggable = true;
      wrapper.className = "group relative my-1.5 w-fit max-w-full cursor-grab";

      const image = document.createElement("img");
      image.src = noteImageSrc(imageId);
      image.alt = "";
      image.dataset.imageId = imageId;
      image.draggable = true;
      image.className =
        "block max-h-48 max-w-full rounded-(--radius-control) border border-rule object-contain outline-accent group-[.ProseMirror-selectednode]:outline-2";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", "Hapus gambar");
      remove.className =
        "absolute right-0 top-0 flex size-5 translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-ink text-xs text-surface";
      remove.textContent = "×";
      remove.addEventListener("mousedown", (event) => event.preventDefault());
      remove.addEventListener("click", (event) => {
        event.preventDefault();
        // The text is locked while the form sends, and so is its image.
        if (editor.isEditable) wrapper.dispatchEvent(new CustomEvent(NOTE_IMAGE_REMOVE, { bubbles: true, detail: imageId }));
      });

      wrapper.append(image, remove);
      return { dom: wrapper };
    };
  },
});
