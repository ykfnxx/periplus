"use client"

import { useEffect, useRef } from "react"

export default function FilePreview({
  file,
  alt = file.name,
  className = "h-full w-full object-cover",
}: {
  file: File
  alt?: string
  className?: string
}) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    if (image.current) image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={image} alt={alt} draggable={false} className={className} />
  )
}
