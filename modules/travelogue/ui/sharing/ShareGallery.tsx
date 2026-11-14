"use client"
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import MediaGallery from "../photos/MediaGallery"
import { Modal } from "../../../../components/ui/Modal"
import { Button } from "@/components/kumo/components/button/button"

export type ShareGalleryPhoto = {
  id: string
  url: string
  caption: string
  author: string
  alt: string
}
const OpenPhoto = createContext<
  (index: number, trigger: HTMLButtonElement) => void
>(() => {
  throw new Error("SharePhoto requires ShareGallery")
})
export function SharePhoto({
  photo,
  index,
  priority = false,
}: {
  photo: ShareGalleryPhoto
  index: number
  priority?: boolean
}) {
  const open = useContext(OpenPhoto)
  return (
    <button
      type="button"
      className="share-photo"
      aria-label={`放大照片：${photo.alt}`}
      onClick={(event) => open(index, event.currentTarget)}
    >
      {/* Share-authorized URLs must not enter a public image-optimization cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </button>
  )
}
export default function ShareGallery({
  photos,
  children,
}: {
  photos: ShareGalleryPhoto[]
  children: ReactNode
}) {
  const [index, setIndex] = useState<number | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const current = index === null ? null : photos[index]
  const open = useCallback((next: number, button: HTMLButtonElement) => {
    trigger.current = button
    setIndex(next)
  }, [])
  return (
    <OpenPhoto.Provider value={open}>
      {children}
      {index !== null && current && (
        <Modal
          title="旅程照片"
          hideTitle
          onClose={() => {
            setIndex(null)
            requestAnimationFrame(() =>
              trigger.current?.focus({ preventScroll: true })
            )
          }}
          className="share-photo-dialog h-[min(780px,calc(100dvh-40px))]! w-[min(1200px,calc(100vw-32px))]! max-w-none! overflow-hidden! bg-photo-stage! p-0! text-white! max-sm:h-dvh! max-sm:w-screen! max-sm:rounded-none!"
          closeClassName="text-white!"
          backdropClassName="bg-photo-overlay"
        >
          {() => (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex min-h-14 items-center px-5 text-sm">
                {index + 1} / {photos.length}
              </div>
              <div className="relative min-h-0 flex-1">
                <MediaGallery
                  photos={photos}
                  index={index}
                  onIndex={setIndex}
                  globalKeys
                />
                <Button
                  variant="ghost"
                  shape="square"
                  aria-label="上一张照片"
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                  className="absolute top-1/2 left-2 bg-photo-overlay! text-white!"
                >
                  <ChevronLeft size={20} />
                </Button>
                <Button
                  variant="ghost"
                  shape="square"
                  aria-label="下一张照片"
                  disabled={index === photos.length - 1}
                  onClick={() => setIndex(index + 1)}
                  className="absolute top-1/2 right-2 bg-photo-overlay! text-white!"
                >
                  <ChevronRight size={20} />
                </Button>
              </div>
              <div className="px-6 py-4 text-center text-sm leading-6 whitespace-pre-wrap">
                {current.caption}
                {current.caption && <br />}照片 · {current.author}
              </div>
            </div>
          )}
        </Modal>
      )}
    </OpenPhoto.Provider>
  )
}
