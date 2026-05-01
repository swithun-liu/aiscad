import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const syntaxTheme = HighlightStyle.define([
  { tag: tags.propertyName, color: '#8fb4ff' },
  { tag: tags.string, color: '#d8c38f' },
  { tag: tags.number, color: '#7dd3c7' },
  { tag: [tags.bool, tags.null], color: '#c4b5fd' },
  { tag: tags.separator, color: '#7c8aa5' },
  { tag: tags.brace, color: '#93a3bf' },
])

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: '#d6e1f5',
    backgroundColor: '#081225',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "'SFMono-Regular', ui-monospace, monospace",
    lineHeight: '1.5',
  },
  '.cm-content, .cm-gutter': {
    minHeight: '100%',
    fontFamily: "'SFMono-Regular', ui-monospace, monospace",
    fontSize: '14px',
  },
  '.cm-content': {
    padding: '12px 0',
    caretColor: '#f8fafc',
  },
  '.cm-line': {
    padding: '0 14px',
  },
  '.cm-gutters': {
    backgroundColor: '#06101f',
    color: '#5f7394',
    borderRight: '1px solid rgba(143, 180, 255, 0.08)',
  },
  '.cm-foldGutter': {
    width: '28px',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(143, 180, 255, 0.06)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(143, 180, 255, 0.06)',
    color: '#9cb4d8',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(96, 165, 250, 0.22) !important',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#e5eefc',
  },
  '.cm-foldGutter .cm-gutterElement': {
    color: '#4f6180',
    minWidth: '28px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    lineHeight: '1',
    cursor: 'pointer',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: '#9cb4d8',
    backgroundColor: 'rgba(143, 180, 255, 0.08)',
    borderRadius: '8px',
  },
}, { dark: true })

function createExtensions(callbacks) {
  return [
    history(),
    foldGutter(),
    indentOnInput(),
    bracketMatching(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    syntaxHighlighting(syntaxTheme),
    json(),
    baseTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) callbacks.onChange?.(update.state.doc.toString())
      if (update.docChanged || update.selectionSet || update.focusChanged) {
        callbacks.onSelectionChange?.({
          value: update.state.doc.toString(),
          cursorOffset: update.state.selection.main.head,
          hasFocus: update.view.hasFocus,
        })
      }
    }),
  ]
}

export function createJsonEditor(container, options = {}) {
  const callbacks = {
    onChange: options.onChange,
    onSelectionChange: options.onSelectionChange,
  }

  const state = EditorState.create({
    doc: options.value || '',
    extensions: createExtensions(callbacks),
  })

  const view = new EditorView({
    state,
    parent: container,
  })

  view.dom.dataset.role = 'json-editor'

  const api = {
    dom: view.dom,
    getValue() {
      return view.state.doc.toString()
    },
    setValue(nextValue) {
      const currentValue = view.state.doc.toString()
      if (nextValue === currentValue) return
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: nextValue },
      })
    },
    getCursorOffset() {
      return view.state.selection.main.head
    },
    setCursorOffset(offset) {
      const clampedOffset = Math.max(0, Math.min(offset, view.state.doc.length))
      view.dispatch({
        selection: EditorSelection.cursor(clampedOffset),
        scrollIntoView: true,
      })
      view.focus()
    },
    focus() {
      view.focus()
    },
    destroy() {
      view.destroy()
    },
  }

  container.__jsonEditor = api
  view.dom.__jsonEditor = api

  return api
}
