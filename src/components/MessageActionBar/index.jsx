import React, { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { FiCopy, FiThumbsUp, FiThumbsDown } from "react-icons/fi"
import { showNotification } from "components/ToastMessage/TotastMessage"
import FeedbackModal, { resolveValidCompanyChatId } from "components/FeedbackModal"
import { DEFAULT_SOURCE_LOGO, FEEDBACK_TYPE, DESELECT_FEEDBACK_PAYLOAD } from "constants/dynamic-chat"
import { submitChatFeedbackApi } from "api/endpoints/feedback"
import { useChatStorage } from "hooks/useStorage"
// SourcesPanel is now imported and rendered at the top-level DynamicVoiceChat component to allow layout squeezing

/**
 * MessageActionBar — row of action buttons shown below each bot message.
 */
function MessageActionBar({
  message,
  companyChatId,
  sessionId,
  sources = [],
  isStreaming,
  isMobile,
  accessToken,
  activeSourcesChatId,
  onToggleSources,
  thumbs_up,
  thumbs_down,
}) {
  const { t } = useTranslation()
  const chatStore = useChatStorage()
  const chatHistory = chatStore(state => state.chatHistory)
  const setChatHistory = chatStore(state => state.setChatHistory)

  const isUp = Boolean(thumbs_up)
  const isDown = Boolean(thumbs_down)

  const [activeFeedback, setActiveFeedback] = useState(() => {
    if (isUp) return FEEDBACK_TYPE.THUMBS_UP
    if (isDown) return FEEDBACK_TYPE.THUMBS_DOWN
    return null
  })
  const [feedbackModal, setFeedbackModal] = useState(null)
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)

  useEffect(() => {
    if (isUp) {
      setActiveFeedback(FEEDBACK_TYPE.THUMBS_UP)
    } else if (isDown) {
      setActiveFeedback(FEEDBACK_TYPE.THUMBS_DOWN)
    } else {
      setActiveFeedback(null)
    }
  }, [isUp, isDown])

  const updateStoreFeedback = (isPositive, isNegative) => {
    if (typeof setChatHistory === "function" && Array.isArray(chatHistory)) {
      const updated = chatHistory.map(item => {
        if (item.updated_at === companyChatId) {
          return { ...item, thumbs_up: isPositive, thumbs_down: isNegative }
        }
        return item
      })
      setChatHistory(updated)
    }
  }

  const sourcesOpen = activeSourcesChatId === companyChatId

  const hasSources = Array.isArray(sources) && sources.length > 0

  const handleCopy = async () => {
    try {
      // Strip HTML tags for plain text copy
      const plain = message.replace(/<[^>]*>/g, "")
      await navigator.clipboard.writeText(plain)
      showNotification({
        message: `${t("copied")}!`,
        type: "success",
        options: { autoClose: 3000, isOfflineToast: true },
      })
    } catch {
      showNotification({
        message: t("copyFailed"),
        type: "error",
        options: { autoClose: 3000, isOfflineToast: true },
      })
    }
  }

  const handleFeedbackClick = async (type) => {
    if (!accessToken || isSubmittingFeedback) return
    if (activeFeedback === type) {
      // Toggle off — no re-open, just deselect
      setIsSubmittingFeedback(true)
      setActiveFeedback(null)
      updateStoreFeedback(false, false)
      try {
        const finalCompanyChatId = await resolveValidCompanyChatId(companyChatId, sessionId, chatHistory)
        await submitChatFeedbackApi({
          company_chat: finalCompanyChatId,
          ...DESELECT_FEEDBACK_PAYLOAD,
        })
      } catch (error) {
        console.error("Error submitting deselect feedback:", error)
      } finally {
        setIsSubmittingFeedback(false)
      }
      return
    }
    setFeedbackModal(type)
  }

  const handleFeedbackSubmitted = (type) => {
    setActiveFeedback(type)
    updateStoreFeedback(type === FEEDBACK_TYPE.THUMBS_UP, type === FEEDBACK_TYPE.THUMBS_DOWN)
  }

  // Don't render during active streaming
  if (isStreaming) return null

  return (
    <>
      <div className="msg-action-bar">
        {/* Copy */}
        <button
          className="msg-action-btn"
          onClick={handleCopy}
          title={t("copy")}
          aria-label={t("copy")}
        >
          <FiCopy />
        </button>

        {/* Thumbs Up — only for logged-in users */}
        {accessToken && (
          <button
            className={`msg-action-btn ${activeFeedback === FEEDBACK_TYPE.THUMBS_UP ? "msg-action-btn--active msg-action-btn--positive" : ""}`}
            onClick={() => handleFeedbackClick(FEEDBACK_TYPE.THUMBS_UP)}
            disabled={isSubmittingFeedback}
            title={t("goodResponse")}
            aria-label={t("goodResponse")}
            aria-pressed={activeFeedback === FEEDBACK_TYPE.THUMBS_UP}
          >
            <FiThumbsUp />
          </button>
        )}

        {/* Thumbs Down — only for logged-in users */}
        {accessToken && (
          <button
            className={`msg-action-btn ${activeFeedback === FEEDBACK_TYPE.THUMBS_DOWN ? "msg-action-btn--active msg-action-btn--negative" : ""}`}
            onClick={() => handleFeedbackClick(FEEDBACK_TYPE.THUMBS_DOWN)}
            disabled={isSubmittingFeedback}
            title={t("badResponse")}
            aria-label={t("badResponse")}
            aria-pressed={activeFeedback === FEEDBACK_TYPE.THUMBS_DOWN}
          >
            <FiThumbsDown />
          </button>
        )}

        {/* Sources — only when available */}
        {hasSources && (
          <button
            className={`msg-action-btn ${sourcesOpen ? "msg-action-btn--active" : ""}`}
            onClick={() => onToggleSources(sources)}
            title={t("sources")}
            aria-label={t("sources")}
          >
            <div className="msg-action-logos-container">
            <img
              src={DEFAULT_SOURCE_LOGO}
                alt="Source logo"
              className="msg-action-logo"
            />
            </div>
            <span className="msg-action-label">{t("sources")} ({sources.length})</span>
          </button>
        )}
      </div>

      {/* Feedback modal */}
      <FeedbackModal
        isOpen={!!feedbackModal}
        type={feedbackModal}
        companyChatId={companyChatId}
        sessionId={sessionId}
        onClose={() => setFeedbackModal(null)}
        onSubmitted={handleFeedbackSubmitted}
      />
    </>
  )
}

export default MessageActionBar
