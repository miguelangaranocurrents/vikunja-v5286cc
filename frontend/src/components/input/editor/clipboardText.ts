import {Extension} from '@tiptap/core'
import {Plugin, PluginKey} from '@tiptap/pm/state'
import type {Fragment, Node as PMNode, Slice} from '@tiptap/pm/model'

function inlineText(node: PMNode): string {
	return node.textBetween(0, node.content.size, '\n', leaf => {
		if (leaf.type.name === 'hardBreak') {
			return '\n'
		}
		return leaf.type.spec.leafText?.(leaf) ?? ''
	})
}

function prefixLines(lines: string[], first: string, rest: string): string[] {
	return lines.map((line, i) => (i === 0 ? first : rest) + line)
}

function serializeListItem(item: PMNode, marker: string): string[] {
	const lines = serializeBlocks(item.content, '\n')
	if (lines.length === 0) {
		lines.push('')
	}
	return prefixLines(lines, marker, ' '.repeat(marker.length))
}

function serializeBlock(node: PMNode): string[] {
	switch (node.type.name) {
		case 'bulletList': {
			const lines: string[] = []
			node.forEach(item => lines.push(...serializeListItem(item, '- ')))
			return lines
		}
		case 'orderedList': {
			const lines: string[] = []
			const start = typeof node.attrs.start === 'number' ? node.attrs.start : 1
			node.forEach((item, _offset, index) => lines.push(...serializeListItem(item, `${start + index}. `)))
			return lines
		}
		case 'taskList': {
			const lines: string[] = []
			node.forEach(item => lines.push(...serializeListItem(item, item.attrs.checked ? '- [x] ' : '- [ ] ')))
			return lines
		}
		case 'listItem':
			return serializeListItem(node, '- ')
		case 'taskItem':
			return serializeListItem(node, node.attrs.checked ? '- [x] ' : '- [ ] ')
		case 'blockquote':
			return serializeBlocks(node.content, '\n\n').map(line => line === '' ? '>' : `> ${line}`)
		case 'codeBlock':
			return node.textContent.split('\n')
	}

	if (node.isTextblock) {
		return inlineText(node).split('\n')
	}

	if (node.isLeaf) {
		const text = node.type.spec.leafText?.(node) ?? ''
		return text === '' ? [] : text.split('\n')
	}

	return serializeBlocks(node.content, '\n')
}

function serializeBlocks(fragment: Fragment, separator: string): string[] {
	const parts: string[] = []
	fragment.forEach(child => {
		if (child.isInline) {
			// stray inline content (e.g. an open slice) - collect it as text
			const text = child.isText ? child.text ?? '' : (child.type.spec.leafText?.(child) ?? '')
			if (parts.length > 0 && !parts[parts.length - 1].endsWith('\n')) {
				parts[parts.length - 1] += text
			} else {
				parts.push(text)
			}
			return
		}
		parts.push(serializeBlock(child).join('\n'))
	})
	return parts.join(separator).split('\n')
}

/**
 * Serializes a slice to plain text, keeping list markers so that copied lists
 * still read as lists (and paste back as markdown lists).
 */
export function serializeSliceAsText(slice: Slice): string {
	// A selection inside a single textblock is plain text, no markers.
	let fragment = slice.content
	let depth = 0
	while (
		fragment.childCount === 1 &&
		!fragment.firstChild!.isTextblock &&
		!fragment.firstChild!.isInline &&
		depth < slice.openStart
	) {
		fragment = fragment.firstChild!.content
		depth++
	}
	if (fragment.childCount === 1 && fragment.firstChild!.isTextblock && depth < slice.openStart) {
		return inlineText(fragment.firstChild!)
	}

	return serializeBlocks(slice.content, '\n\n').join('\n')
}

export const ClipboardTextWithListMarkers = Extension.create({
	name: 'clipboardTextWithListMarkers',

	// Must run before tiptap's core clipboardTextSerializer plugin.
	priority: 1000,

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('clipboardTextWithListMarkers'),
				props: {
					clipboardTextSerializer: slice => serializeSliceAsText(slice),
				},
			}),
		]
	},
})
