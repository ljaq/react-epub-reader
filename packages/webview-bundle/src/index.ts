export { WebViewReaderApp } from './WebViewReaderApp'
export { installBridge } from './bridge/dispatch'
export {
  INBOUND_TYPES,
  OUTBOUND_TYPES,
  createMessage,
  parseMessage,
  type BridgeMessage,
  type LoadBookPayload,
  type LoadEpubPayload,
  type InjectChapterPayload,
} from './bridge/protocol'
