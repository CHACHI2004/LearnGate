import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

export function RichTextEditor({ value, onChange, readOnly = false }: {
  value: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, protocols: ["http", "https", "mailto"] }),
    ],
    content: value,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange?.(current.getHTML()),
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== value) editor.commands.setContent(value);
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div className={`rich-editor ${readOnly ? "rich-editor-readonly" : ""}`}>
      {!readOnly && <div className="editor-toolbar" aria-label="Text formatting">
        <button type="button" disabled={!editor} aria-pressed={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" disabled={!editor} aria-pressed={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
        <button type="button" disabled={!editor} aria-pressed={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</button>
        <button type="button" disabled={!editor} aria-pressed={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1. List</button>
        <button type="button" disabled={!editor} aria-pressed={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>Quote</button>
      </div>}
      <EditorContent editor={editor} />
    </div>
  );
}
