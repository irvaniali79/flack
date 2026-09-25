declare module 'react-syntax-highlighter' {
  import type { ComponentType, ReactNode, CSSProperties } from 'react'

  export interface SyntaxHighlighterProps {
    language?: string
    style?: unknown
    children: string | ReactNode
    showLineNumbers?: boolean
    wrapLongLines?: boolean
    customStyle?: CSSProperties
    codeTagProps?: Record<string, unknown>
    useInlineStyles?: boolean
    [key: string]: unknown
  }

  export const Prism: ComponentType<SyntaxHighlighterProps>
  export const Light: ComponentType<SyntaxHighlighterProps>
  export default function SyntaxHighlighter(props: SyntaxHighlighterProps): JSX.Element
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  export const oneDark: Record<string, unknown>
  export const oneLight: Record<string, unknown>
}
