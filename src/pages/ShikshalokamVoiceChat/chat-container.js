import { API_ENDPOINTS } from "../../constants/urls"
import { BiLoader } from "react-icons/bi"
import { getFlowInfoApi } from "../../api/endpoints"
import { getProfileApi } from "../../api/endpoints/user"
import { getSessionDetails } from "../../services/api.service"
import { languageList } from "./enum"
import { setLanguage } from "../../i18n"
import { useChatStorage, useUserStorage } from "../../hooks/useStorage"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useSiteDataSessionStore } from "store"
import DynamicVoiceChat from "./dynamic-voice-chat"
import ProfileChatPopup from "../../components/ProfileChatPopup/ProfileChatPopup"
import ROUTES from "../../url"
import useSmartChatStorage from "../../hooks/useSmartChatStorage"
import useChatDataLocalStore from "../../store/slices/chatData/chatDataLocal"
import useUserDataLocalStore from "../../store/slices/userData/userDataLocal"
import { env } from "utils/env"

function ChatContainer() {
  const navigate = useNavigate()
  const flowName = env.FLOW_NAME()

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log("[CHAT CONTAINER MOUNTED]", { pathname: window.location.pathname })
    }
  }, [])

  const [isLoading, setIsLoading] = useState(false)
  const [showProfilePopup, setShowProfilePopup] = useState(false)
  const [profileCheckDone, setProfileCheckDone] = useState(false)
  const [profileSessionId, setProfileSessionId] = useState(null)

  const chatLanguage = useSiteDataSessionStore(state => state.chatLanguage)
  const ipFetched = useUserStorage()(state => state.ipFetched)
  const setIpFetched = useUserStorage()(state => state.setIpFetched)
  const setIsNewChatOpen = useChatStorage()(state => state.setIsNewChatOpen)
  const setIsOldChatOpen = useChatStorage()(state => state.setIsOldChatOpen)
  const setSessionId = useChatStorage()(state => state.setSessionId)

  const [chatHistory, setChatHistory, removeChatHistory, getChatHistory] = useSmartChatStorage()

  const accessToken = useUserDataLocalStore(state => state.access_token)
  const profileId = useUserDataLocalStore(state => state.profileId)

  const { data: flowInfo } = useQuery({
    queryKey: [API_ENDPOINTS.FLOW_CONNECTION_INFO, flowName],
    queryFn: () => getFlowInfoApi(flowName),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    const chat_history = getChatHistory()
    // Remove unreceived messages on mount (e.g. messages sent right before
    // a page reload that were never echoed back by the server).
    // Profile-onboarding messages (saathi_profile) are preserved here so
    // they survive language changes and navigation during the popup session.
    // They are only cleared in handleProfilePopupClose once onboarding completes.
    const updated_chat_history = chat_history.filter(chat => chat.received)
    setChatHistory(updated_chat_history)
  }, [])

  // Check if profile onboarding is needed
  useEffect(() => {
    setProfileCheckDone(false)
    if (!accessToken || !profileId) {
      setProfileCheckDone(true)
      return
    }
    const acceptedTnC = useUserDataLocalStore.getState().has_accepted_tnc
    if (acceptedTnC !== true) {
      setProfileCheckDone(true)
      return
    }

    ;(async () => {
      try {
        const data = await getProfileApi(profileId, accessToken)
        if (data?.is_profile_complete === false) {
          try {
            const profileSession = await getSessionDetails()
            setProfileSessionId(profileSession.sessionid)
          } catch (err) {
            console.error("[ChatContainer] profile session fetch failed:", err)
          }
          setShowProfilePopup(true)
        }
      } catch (error) {
        console.error("[ChatContainer] profile check failed:", error)
      } finally {
        setProfileCheckDone(true)
      }
    })()
  }, [accessToken, profileId])

  const handleProfilePopupClose = useCallback(async () => {
    // 1. Hide the popup first — this unmounts the popup's DynamicVoiceChat
    //    and changes the main DVC's key, causing it to remount fresh.
    setShowProfilePopup(false)
    setProfileSessionId(null)

    // 2. Now clear the store — no other DVC instance is mounted to write back.
    //    Use a microtask to ensure React has processed the unmount.
    await Promise.resolve()
    const store = useChatDataLocalStore.getState()
    store.setIsOldChatOpen(false)
    store.setIsNewChatOpen(true)
    store.setShowHomepage(true)
    store.setIntroMessage(null)
    store.setSessionId(null)
    store.setStrandStep(null)
    store.setChatHistory([])

    try {
      const session = await getSessionDetails()
      store.setSessionId(session.sessionid)
    } catch (error) {
      console.error("[handleProfilePopupClose] getSessionDetails failed:", error)
    }
  }, [])

  useEffect(() => {
    const runSetup = async () => {
      try {
        if (!accessToken) {
          navigate(ROUTES.SHIKSHALOKAM_HOME_PAGE, { replace: true })
          return
        }

        const currentSessionId = useChatDataLocalStore.getState().sessionId
        if (!currentSessionId) {
          setIsLoading(true)
          setIsOldChatOpen(false)
          setIsNewChatOpen(true)

          try {
            const session = await getSessionDetails()
            setSessionId(session.sessionid)
          } catch (error) {
            console.log("[ChatContainer] authenticated session bootstrap failed:", error)
            navigate(ROUTES.SHIKSHALOKAM_HOME_PAGE)
          }

          const storedLanguage = chatLanguage || languageList[0].value
          setLanguage(storedLanguage)

          setIsLoading(false)
        }
      } finally {
        setIpFetched(true)
      }
    }

    if (!flowInfo) return

    setIpFetched(false)
    runSetup()
  }, [accessToken, flowInfo])

  return (
    <>
      <div style={showProfilePopup ? { filter: "blur(10px)", pointerEvents: "none", position: "fixed", inset: 0, overflow: "hidden" } : undefined}>
        {accessToken && !isLoading && profileCheckDone && <DynamicVoiceChat key={showProfilePopup ? "onboarding" : "main"} />}
      </div>
      {showProfilePopup && (
        <ProfileChatPopup isOpen={showProfilePopup} onClose={handleProfilePopupClose} sessionId={profileSessionId} />
      )}
      {!showProfilePopup && (isLoading || !ipFetched || !profileCheckDone) && (
        <div className="loader-load-spinner">
          <div className="div67">
            <BiLoader className="loader-rotate-loader loader-icon" />
          </div>
        </div>
      )}
    </>
  )
}

export default ChatContainer
