import { createStore } from "zustand/vanilla"
import { operationId } from "./operation-id"
import {
  emptyReceiptValues,
  type ReceiptReview,
  type ReceiptFormValues,
} from "../model/receipt-draft"
export interface ReceiptImportApi {
  upload: (file: File, uploadId: string) => Promise<string>
  recognize: (assetId: string) => Promise<ReceiptFormValues>
  save: (
    review: ReceiptReview,
    eventId: string | null,
    saveKey: string
  ) => Promise<string>
}
export function createReceiptImport(api: ReceiptImportApi) {
  const state = createStore(() => ({
    file: null as File | null,
    review: null as ReceiptReview | null,
    busy: null as "recognizing" | "saving" | null,
    error: null as string | null,
  }))
  let uploadId = operationId()
  let saveKey = operationId()
  async function recognize() {
    const { file, busy, review } = state.getState()
    if (!file || busy) return
    state.setState({ busy: "recognizing", error: null })
    let uploadedAssetId = review?.assetId
    try {
      uploadedAssetId ||= await api.upload(file, uploadId)
      const values = await api.recognize(uploadedAssetId)
      state.setState({ review: { assetId: uploadedAssetId, values } })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "账单识别失败。"
      if (uploadedAssetId)
        state.setState({
          review: review || {
            assetId: uploadedAssetId,
            values: emptyReceiptValues,
          },
          error: `${message} 可以手动填写后加入记录，或重新识别。`,
        })
      else state.setState({ error: message })
    } finally {
      state.setState({ busy: null })
    }
  }
  return {
    getState: state.getState,
    subscribe: state.subscribe,
    choose(file: File) {
      uploadId = operationId()
      saveKey = operationId()
      state.setState({ file, review: null, error: null })
    },
    edit(values: ReceiptFormValues) {
      state.setState(({ review }) => ({ review: { ...review!, values } }))
    },
    recognize,
    async submit(target: string | null) {
      const { file, busy, review } = state.getState()
      if (!file || busy) return
      state.setState({ error: null })
      if (!review) {
        await recognize()
        return
      }
      state.setState({ busy: "saving" })
      try {
        return await api.save(review, target, saveKey)
      } catch (cause) {
        state.setState({
          error:
            cause instanceof Error
              ? cause.message
              : "保存失败，核对内容已保留，请重试。",
        })
      } finally {
        state.setState({ busy: null })
      }
    },
  }
}
