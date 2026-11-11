import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

/**
 * The page's tree with its async server components awaited, as the server
 * renderer does; the client renderer cannot run them. Elements passed in
 * other props than `children` (Book detail's `header`) are awaited too.
 */
export async function serverTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(serverTree))
  if (!isValidElement(node)) return node
  const { type, props } = node as ReactElement<Record<string, unknown> & { children?: ReactNode }>
  if (typeof type === 'function' && type.constructor.name === 'AsyncFunction') {
    return serverTree(await (type as (props: unknown) => Promise<ReactNode>)(props))
  }
  const elementProps: Record<string, ReactNode> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key !== 'children' && isValidElement(value)) elementProps[key] = await serverTree(value)
  }
  const extra = Object.keys(elementProps).length > 0 ? elementProps : undefined
  if (props.children === undefined) return extra ? cloneElement(node, extra) : node
  const children = await serverTree(props.children)
  return Array.isArray(children)
    ? cloneElement(node, extra, ...(children as ReactNode[]))
    : cloneElement(node, extra, children)
}
