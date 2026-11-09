'use client'
// PR 030: minimal rich text (tebal, miring, daftar) for "Informasi dan Kronologi Kejadian"; stores HTML.
import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, List, ListOrdered } from 'lucide-react'

export default function RichText({ id, value, onChange, onBlur, disabled, placeholder, invalid }: {
  id: string; value: string; onChange: (html: string) => void; onBlur?: () => void; disabled?: boolean; placeholder?: string; invalid?: boolean
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false }), Placeholder.configure({ placeholder: placeholder || '' })],
    content: value || '',
    editorProps: { attributes: { id, class: 'sitrep-prose min-h-[140px] px-3 py-2 text-sm text-slate-700 focus:outline-none', 'aria-label': 'Kronologi kejadian' } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
    onBlur: () => onBlur?.(),
  })
  useEffect(() => { editor?.setEditable(!disabled) }, [editor, disabled])
  useEffect(() => {
    if (editor && !editor.isFocused && (value || '') !== (editor.isEmpty ? '' : editor.getHTML())) editor.commands.setContent(value || '', false)
  }, [editor, value])
  const btn = (on: boolean, act: () => void, label: string, icon: React.ReactNode) => (
    <button type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={act} disabled={disabled}
      className={`rounded p-1.5 ${on ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-100'}`}>{icon}</button>
  )
  return (
    <div className={`overflow-hidden rounded-lg border bg-white ${invalid ? 'border-red-300' : 'border-slate-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30'} ${disabled ? 'bg-slate-50' : ''}`}>
      {!disabled && (
        <div className="flex gap-0.5 border-b border-slate-100 bg-slate-50/60 px-1.5 py-1">
          {btn(!!editor?.isActive('bold'), () => editor?.chain().focus().toggleBold().run(), 'Tebal', <Bold size={13} />)}
          {btn(!!editor?.isActive('italic'), () => editor?.chain().focus().toggleItalic().run(), 'Miring', <Italic size={13} />)}
          {btn(!!editor?.isActive('bulletList'), () => editor?.chain().focus().toggleBulletList().run(), 'Daftar', <List size={13} />)}
          {btn(!!editor?.isActive('orderedList'), () => editor?.chain().focus().toggleOrderedList().run(), 'Daftar bernomor', <ListOrdered size={13} />)}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
