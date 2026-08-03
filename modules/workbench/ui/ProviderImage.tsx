"use client"

import { useState } from "react"
import Image from "next/image"
import { Hotel, Landmark, MapPin, UtensilsCrossed } from "lucide-react"

function FallbackIcon({ category }: { category: string }) {
  if (category === "HOTEL")
    return <Hotel className="h-6 w-6" aria-hidden="true" />
  if (category === "RESTAURANT") {
    return <UtensilsCrossed className="h-6 w-6" aria-hidden="true" />
  }
  if (category === "TRANSIT")
    return <MapPin className="h-6 w-6" aria-hidden="true" />
  return <Landmark className="h-6 w-6" aria-hidden="true" />
}

export function ProviderImage({
  src,
  alt,
  category,
  width,
  height,
  className,
}: {
  src?: string
  alt: string
  category: string
  width: number
  height: number
  className: string
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        data-testid={`provider-image-fallback-${category}`}
        className={`${className} flex items-center justify-center bg-route-summary text-olive`}
      >
        <FallbackIcon category={category} />
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
