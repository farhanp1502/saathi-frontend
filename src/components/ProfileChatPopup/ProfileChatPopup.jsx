import PropTypes from "prop-types"
import { useRef, useEffect } from "react"
import DynamicVoiceChat from "../../pages/ShikshalokamVoiceChat/dynamic-voice-chat"
import "../TnC/privacyPolicyPopup.css"
import env from "../../utils/env"


function ProfileChatPopup({ isOpen, onClose, sessionId }) {
  const timerRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
      document.documentElement.style.overflow = "hidden"
    }
    return () => {
      document.body.style.overflow = ""
      document.documentElement.style.overflow = ""
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleProfileExtracted = () => {
    const delay = env.ONBOARDING_REDIRECT_DELAY()
    timerRef.current = setTimeout(() => {
      onClose?.()
    }, delay)
  }

  return (
    <>
      {/* Backdrop — reuses .tnc-cover CSS for backdrop-filter: blur(10px) */}
      <div className="tnc-cover" />

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "min(600px, 95vw)",
            height: "85vh",
            background: "#fff",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 10px 20px rgba(0, 0, 0, 0.25)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <DynamicVoiceChat
            flowOverride={env.PROFILE_FLOW_NAME()}
            isPopupMode={true}
            onProfileExtracted={handleProfileExtracted}
            sessionOverride={sessionId}
          />
        </div>
      </div>
    </>
  )
}

ProfileChatPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  sessionId: PropTypes.string,
}

export default ProfileChatPopup
