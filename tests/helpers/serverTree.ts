import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

/**
 * The page's tree with its async server components awaited, as the server
 * renderer does; the client renderer cannot run them.
 */
export async function serverTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(serverTree))
  if (!isValidElement(node)) return node
  const { type, props } = node as ReactElement<{ children?: ReactNode }>
  if (typeof type === 'function' && type.constructor.name === 'AsyncFunction') {
    return serverTree(await (type as (props: unknown) => Promise<ReactNode>)(props))
  }
  if (props.children === undefined) return node
  const children = await serverTree(props.children)
  return Array.isArray(children)
    ? cloneElement(node, undefined, ...(children as ReactNode[]))
    : cloneElement(node, undefined, children)
}
