import React, { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { RxCross2 } from "react-icons/rx"

function SourceIcon({ src }) {
  const [imgError, setImgError] = useState(false)
  if (src?.logo && !imgError) {
    return (
      <img
        src={src.logo}
        className="source-item-logo"
        alt={src.company || src.domain || "logo"}
        onError={() => setImgError(true)}
      />
    )
  }
  return null
}

function isValidUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return false
  try {
    const parsed = new URL(urlString)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function SourceItem({ src }) {
  const [isMultiLine, setIsMultiLine] = useState(false)
  const titleRef = useRef(null)
  const validUrl = isValidUrl(src?.url)

  useEffect(() => {
    if (titleRef.current) {
      const el = titleRef.current
      const style = window.getComputedStyle(el)
      const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.4) || 18
      const lines = Math.round(el.offsetHeight / lineHeight)
      setIsMultiLine(lines > 2)
    }
  }, [src?.title])

  const content = (
    <>
      <SourceIcon src={src} />
      <div className="source-item-content">
        <span ref={titleRef} className="source-item-title" title={src?.title}>
          {src?.title}
        </span>
      </div>
    </>
  )

  return (
    <li className={`source-item ${validUrl ? "cursor-pointer" : ""} ${isMultiLine ? "source-item--top" : ""}`}>
      {validUrl ? (
        <a
          href={src?.url}
          target="_blank"
          rel="noopener noreferrer"
          className="source-item-anchor"
        >
          {content}
        </a>
      ) : (
        content
      )}
    </li>
  )
}

/**
 * SourcesPanel — bottom sheet on mobile, right slide-in on desktop.
 * @param {{ isOpen: boolean, sources: Array, isMobile: boolean, onClose: () => void }} props
 */
function SourcesPanel({ isOpen, sources = [], isMobile, onClose }) {
  const { t } = useTranslation()
  const activeSources = Array.isArray(sources) ? sources.filter(Boolean) : []

  // Lock body scroll when open on mobile
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [isOpen, isMobile])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = e => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, onClose])

  return (
    <>
      {isMobile && isOpen && (
        <div className="sources-overlay" onClick={onClose} aria-hidden="true" />
      )}
      <aside className={`sources-panel ${isMobile ? "sources-panel--mobile" : "sources-panel--desktop"} ${isOpen ? "sources-panel--open" : ""}`} role="dialog" aria-label={t("sources")}>
        <div className="sources-panel-header">
          <h3 className="sources-panel-title">{t("sources")}</h3>
          <button className="sources-panel-close" onClick={onClose} aria-label={t("close")}>
            <RxCross2 />
          </button>
        </div>
        <div className="sources-panel-body">
          {activeSources.length === 0 ? (
            <p className="sources-empty">{t("noSources")}</p>
          ) : (
            <ul className="sources-list">
              {activeSources.map((src, idx) => (
                <SourceItem key={idx} src={src} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}

export default SourcesPanel
