import "../../style.css"
import "./shikshaChatStyle.css"
import { API_ENDPOINTS } from "../../constants/urls"
import { BiLoader } from "react-icons/bi"
import { clearFromStorage, handleS3Upload } from "../../services/storage_service"
import { updateUserProfileApi } from "api/endpoints/user"
import { validateSession } from "utils/session"
import { logoutApi } from "api/endpoints/auth"
import { createMessage } from "../interview-voice"
import { getChatsFromDB, getAI4BharatAudioApi, ai4BharatASRApi, getFlowInfoApi } from "../../api/endpoints"
import { FaCircle } from "react-icons/fa6"
import { FaMicrophone, FaRegStopCircle } from "react-icons/fa"
import { FiDownload, FiLogOut, FiPlus } from "react-icons/fi"
import UserProfileModal, { useProfileModalStore, setShowProfileModal } from "components/UserProfileModal"
import MessageActionBar from "components/MessageActionBar"
import SourcesPanel from "components/SourcesPanel"
import { PROFILE_FORM_SCHEMA, PROFILE_MODAL_CONFIG, extractUserProfileData } from "constants/profileForm"
import { getChatSessionApi, getCompanyBotApi, fetchChatSessionPageApi } from "api/endpoints/chat"
import { getSessionDetails } from "../../services/api.service"
import { getTranslatedIntroMessageApi } from "api/endpoints/ai"
import { HiMiniSpeakerWave, HiMiniSpeakerXMark } from "react-icons/hi2"
import { languageList } from "./enum"
import { sessionFlowName } from "../../constants/session"
import { MdAccountCircle, MdSend } from "react-icons/md"
import { setLanguage } from "../../i18n"
import { toast } from "react-toastify"
import { useAudio } from "hooks/useAudio"
import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { useChatDataSessionStore, useSiteDataSessionStore } from "store"
import useUserDataLocalStore from "store/slices/userData/userDataLocal"
import { useChatStorage, useUserStorage, useSiteStorage } from "hooks/useStorage"
import { useChatWebhook } from "../../hooks/useChatWebhook"
import { useConfirmationPopup } from "hooks/useConfirmationPopup"
import { useNetworkStatus } from "../../hooks/useNetworkStatus"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import DOMPurify from "dompurify"
import env from "../../utils/env"
import MainHeader from "./shikshaChatHeader"
import Notification, { showNotification, showOfflineNotification } from "../../components/ToastMessage/TotastMessage"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import remarkGfm from "remark-gfm"
import Popup from "components/Popup"
import Chip from "components/Chip"
import ROUTES from "../../url"
import Swal from "sweetalert2"
import useCustomMediaQuery from "hooks/useCustomMediaQuery"
import useSmartChatStorage from "hooks/useSmartChatStorage"
import useVoiceRecord, { default_wave_surfer_config } from "../interview-text-voice/useVoiceRecord"
import WaveSurferPlayer from "../interview-text-voice/voice-player"
import { CHAT_SOURCE, CHAT_SPECIAL_IDS } from "constants/dynamic-chat"



// Returns true when `msg` belongs to the given `flow`.
// Tagged messages match only their own flow. Untagged (legacy) messages are
// treated as main-flow data — they match every flow EXCEPT profile flows so
// that old history never leaks into the profile popup.
const msgBelongsToFlow = (msg, flow) => {
  if (msg.flowType) return msg.flowType === flow
  return flow !== env.PROFILE_FLOW_NAME()
}

// Cached userData state from localStorage — populated lazily on first access,
// cleared on logout. Bypasses Zustand hydration timing for auth token reads.
let _userData = null

const getStoredUserData = () => {
  if (_userData !== null) return _userData
  try {
    _userData = JSON.parse(localStorage.getItem("userData") || "{}")?.state ?? {}
  } catch {
    _userData = {}
  }
  return _userData
}

// Keep _userData.access_token in sync with the Zustand store so the cache
// never goes stale when setAccessToken is called (e.g. on 401).
useUserDataLocalStore.subscribe(
  state => state.access_token,
  access_token => {
    if (_userData !== null) {
      _userData.access_token = access_token
    }
  }
)

const DynamicVoiceChat = ({
  type = "",
  flowOverride = null,
  isPopupMode = false,
  onProfileExtracted,
  sessionOverride = null,
}) => {
  const storageFlow = flowOverride || env.FLOW_NAME()
  const showHistorySidebar = !!(storageFlow && storageFlow !== env.PROFILE_FLOW_NAME())

  // ========== useState Hooks ==========
  const [asrAudio, setAsrAudio] = useState(null)
  const [audioCache, setAudioCache] = useState({})
  const [botNameToDisplay, setBotNameToDisplay] = useState("Bot")
  const [companySlug, setCompanySlug] = useState("")
  const [hasOverRideId, setHasOverRideId] = useState(null)
  const [hasStartedListening, setHasStartedListening] = useState(false)
  const [hasStartedRecording, setHasStartedRecording] = useState(false)
  const [intervalId, setIntervalId] = useState(null)
  const [isFetchingData, setIsFetchingData] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isMute, setIsMute] = useState(true)
  const [speakerEnabled, setSpeakerEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('saathi_speaker_enabled')
      return stored === null ? true : stored === 'true'
    } catch {
      return true
    }
  })
  const [isNextAllowed, setIsNextAllowed] = useState(true)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [isStreamingComplete, setIsStreamingComplete] = useState(true)
  const [isTalking, setTalking] = useState(0)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [activeSourcesChatId, setActiveSourcesChatId] = useState(null)
  const [activeSources, setActiveSources] = useState([])
  const hasActiveFlexLayout = showHistorySidebar || isPopupMode || !!activeSourcesChatId
  const [seconds, setSeconds] = useState(0)
  const [sentences, setSentences] = useState([])
  const [shouldFetchIntro, setShouldFetchIntro] = useState(false)
  const [ssoNavigationTriggered, setSsoNavigationTriggered] = useState(false)
  const [textMessage, setTextMessage] = useState("")
  const [downloadFileErrors, setDownloadFileErrors] = useState({})
  const [chatTitle, setChatTitle] = useState([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [sidebarNextPageUrl, setSidebarNextPageUrl] = useState(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const showProfileModal = useProfileModalStore(state => state.showProfileModal)
  const [profileApiData, setProfileApiData] = useState({})
  const [isLoadingMoreSessions, setIsLoadingMoreSessions] = useState(false)
  const [isTokenValidated, setIsTokenValidated] = useState(false)
  // Tracks the updated_at ID of the bot message whose chips have been used.
  // Once set, the chip bar is hidden until a new bot message with chips arrives.
  const [quickReplySentForMsgId, setQuickReplySentForMsgId] = useState(null)
  const { isOffline } = useNetworkStatus()

  const checkIsOffline = useCallback(() => {
    if (!navigator.onLine || isOffline) {
      showOfflineNotification()
      return true
    }
    return false
  }, [isOffline])

  // ========== useSelector Hooks ==========
  const [chatHistory, setChatHistory, removeChatHistory, getChatHistory] = useSmartChatStorage()
  // Ensures _userData is lazily initialized from localStorage on first render.
  // Clear _userData on logout so the next login picks up fresh tokens.
  getStoredUserData()
  const accessToken = _userData?.access_token ?? null
  const botName = useChatStorage()(state => state.botName)
  const chatLanguage = useSiteDataSessionStore(state => state.chatLanguage)
  const firstName = useUserStorage()(state => state.firstName)
  const introMessage = useChatStorage()(state => state.introMessage)
  const isNewChatOpen = useChatStorage()(state => state.isNewChatOpen)
  const isOldChatOpen = useChatStorage()(state => state.isOldChatOpen)
  const languageToUse = useSiteDataSessionStore(state => state.chatLanguage)
  const preferredLanguage = useUserStorage()(state => state.preferredLanguage)
  const previousUrl = useSiteStorage()(state => state.previousUrl)
  const profileToUse = useUserStorage()(state => state.profileId)
  const storeSessionId = useChatStorage()(state => state.sessionId)
  const sessionId = sessionOverride || storeSessionId
  const setChatLanguage = useSiteDataSessionStore(state => state.setChatLanguage)
  const setHasSelectedLanguage = useSiteDataSessionStore(state => state.setHasSelectedLanguage)
  const setStorageFlow = useChatStorage()(state => state.setFlow)
  const setStrandStep = useChatDataSessionStore(state => state.setStrandStep)
  const showHomepageStore = useChatStorage()(state => state.showHomepage)
  // In popup mode, use local state so the popup doesn't read/write the shared
  // showHomepage flag that the main chat manages.
  const [popupShowHomepage, setPopupShowHomepage] = useState(isPopupMode)
  const showHomepage = isPopupMode ? popupShowHomepage : showHomepageStore
  const updateShowHomepage = useCallback((value) => {
    if (isPopupMode) {
      setPopupShowHomepage(value)
    } else {
      setShowHomepage(value)
    }
  }, [isPopupMode])
  const ssoRerouteURL = useSiteStorage()(state => state.ssoRerouteURL)
  const stateMachineLength = useChatStorage()(state => state.stateMachineLength)
  const strandStep = useChatDataSessionStore(state => state.strandStep)
  const taskId = useChatStorage()(state => state.taskId)


  // chat data actions
  const { setShowHomepage, setBotName, setIntroMessage, setIsNewChatOpen, setIsOldChatOpen, setSessionId, setStateMachineLength } = useChatStorage().getState()

  // user data actions
  const { setCompanyName, setFirstName, setState } = useUserStorage().getState()
  const { llmError, setLlmError } = useChatStorage().getState()
  const { setProfileId: setProfileToUse } = useUserStorage().getState()

  // ========== useRef Hooks ==========
  const textAreaRef = useRef(null)
  const _roRef = useRef(null)
  const _placeholderDepsRef = useRef(null)
  const [placeholderIsMultiLine, setPlaceholderIsMultiLine] = useState(false)
  const [placeholderHeight, setPlaceholderHeight] = useState(null)
  const lastBotMessageIndex = useRef(-1)
  const isIntroPlayed = useRef(false)
  const streamingBotMessageRef = useRef(null)
  const profileCompletedRef = useRef(false)
  const onProfileExtractedRef = useRef(onProfileExtracted)
  const pendingNewChatRef = useRef(false)
  const pendingNewChatTimerRef = useRef(null)
  const sidebarBottomReachedRef = useRef(false)
  const isLogoutNavigationRef = useRef(false)
  const hasStreamedRef = useRef(false)
  const quickReplyLockRef = useRef(new Set())

  useEffect(() => {
    onProfileExtractedRef.current = onProfileExtracted
  }, [onProfileExtracted])

  // ========== token validation ==========
  // Called on mount (page load/reload), new chat, and chat history switching.
  // validateSession → readElevateProfileApi handles 401 internally (redirects to login).
  // Any other error is re-thrown and shown as a notification to the user.
  const validateToken = async () => {
    const token = _userData?.access_token ?? null
    if (token === null) {
      clearFromStorage()
      window.location.href = ROUTES.SHIKSHALOKAM_HOME_PAGE
      return false
    }
    try {
      const res = await validateSession()
      const details = res?.profile_details || {}
      if (details) {
        const normalized = extractUserProfileData(details, firstName)
        setProfileApiData(normalized)
        if (normalized.name) setFirstName(normalized.name)
      }
      return true
    } catch (error) {
      showNotification({ message: error?.message || String(error), type: "error" })
    } finally {
      setIsTokenValidated(true)
    }
  }

  useEffect(() => {
    if (!isOffline && navigator.onLine) {
      validateToken().catch(() => {
        setIsTokenValidated(true)
      })
    } else {
      setIsTokenValidated(true)
    }
  }, [isOffline]) // eslint-disable-line react-hooks/exhaustive-deps


  // ========== react query hooks ==========
  const {
    data: flowInfo,
    isError: isFlowInfoError,
    error: flowInfoError,
  } = useQuery({
    queryKey: [API_ENDPOINTS.FLOW_CONNECTION_INFO, storageFlow],
    queryFn: () => getFlowInfoApi(storageFlow),
    // staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const botRoute = useMemo(() => {
    if (flowOverride === env.PROFILE_FLOW_NAME()) {
      return env.PROFILE_BOT_ROUTE()
    }
  
    return flowInfo?.bot_route
  }, [flowOverride, flowInfo?.bot_route])
  
  const { data: companyBotData } = useQuery({
    queryKey: [API_ENDPOINTS.GET_COMPANY_BOT, companySlug, botRoute, languageToUse, accessToken],
    queryFn: () =>
      getCompanyBotApi({
        company_slug: companySlug,
        route: botRoute,
        target_language: languageToUse,
      }),
    enabled: !!(
      languageToUse &&
      shouldFetchIntro &&
      (isNewChatOpen || isOldChatOpen) &&
      profileToUse &&
      botRoute &&
      sessionId
    ),
  })
  
  const { data: introMessageData, isLoading: isIntroMessageLoading } = useQuery({
    queryKey: [API_ENDPOINTS.BOT_VERNACULAR, botRoute, languageToUse],
    queryFn: () =>
      getTranslatedIntroMessageApi({
        language: languageToUse,
        company_bot__route: botRoute,
      }),
    enabled: !!(
      companyBotData &&
      languageToUse &&
      companyBotData?.results?.length > 0 &&
      botRoute
    ),
  })

  const isSimpleBot = useMemo(() => {
    const bots = companyBotData?.results
    if (!bots || bots.length === 0) return null
    return bots[0]?.bot_type === "SIMPLE"
  }, [companyBotData])

  // ========== Other Hooks ==========
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()

  const _runPlaceholderMeasurement = useCallback(() => {
    const el = textAreaRef.current
    if (!el || !el.clientWidth || !_placeholderDepsRef.current) return
    const { hasStartedRecording, isFetchingData, t } = _placeholderDepsRef.current
    const placeholder = hasStartedRecording
      ? t("placeholder1")
      : isFetchingData
      ? t("placeholder2")
      : t("placeholder3")
    const style = window.getComputedStyle(el)
    const fontSize = parseFloat(style.fontSize) || 14
    // measure single line height using a single character
    const singleLineDiv = document.createElement("div")
    singleLineDiv.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:${style.fontSize};font-family:${style.fontFamily};line-height:${style.lineHeight};`
    singleLineDiv.textContent = "A"
    document.body.appendChild(singleLineDiv)
    const singleLineHeight = singleLineDiv.offsetHeight || fontSize * 1.4
    document.body.removeChild(singleLineDiv)
    // measure actual placeholder height with wrapping
    const div = document.createElement("div")
    const borderX = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
    const contentWidth = el.clientWidth - borderX
    div.style.cssText = `position:absolute;visibility:hidden;white-space:pre-wrap;word-break:break-word;box-sizing:border-box;width:${contentWidth}px;font-size:${style.fontSize};font-family:${style.fontFamily};line-height:${style.lineHeight};padding:${style.padding};`
    div.textContent = placeholder
    document.body.appendChild(div)
    const measuredHeight = div.offsetHeight
    setPlaceholderIsMultiLine(measuredHeight > singleLineHeight * 1.5)
    setPlaceholderHeight(measuredHeight)
    document.body.removeChild(div)
  }, []) // stable — always reads fresh values from _placeholderDepsRef

  const textAreaCallbackRef = useCallback((el) => {
    if (_roRef.current) {
      _roRef.current.disconnect()
      _roRef.current = null
    }
    textAreaRef.current = el
    if (!el) return
    const ro = new ResizeObserver(_runPlaceholderMeasurement)
    ro.observe(el)
    _roRef.current = ro
    // initial measurement after mount (RAF so layout is settled)
    requestAnimationFrame(_runPlaceholderMeasurement)
  }, [_runPlaceholderMeasurement])

  // Keep _placeholderDepsRef in sync and re-measure when placeholder text changes
  useEffect(() => {
    _placeholderDepsRef.current = { hasStartedRecording, isFetchingData, t }
    if (!textAreaRef.current) return
    const raf = requestAnimationFrame(_runPlaceholderMeasurement)
    return () => cancelAnimationFrame(raf)
  }, [hasStartedRecording, isFetchingData, t, _runPlaceholderMeasurement])

  const { recordings, HiddenRecorder } = useVoiceRecord()

  const navigate = useNavigate()

  const { showConfirmationPopup } = useConfirmationPopup()
  const { stopAllAudio, audioRef } = useAudio()
  const ttsAbortRef = useRef(null)
  const ttsDisabledRef = useRef(false)
  const wsSystemErrorRef = useRef(false)
  const resetReconnectCountRef = useRef(() => {})
  const markIntentionalCloseRef = useRef(() => {})
  const resetIntentionalCloseRef = useRef(() => {})

  const onFinalReconnectAttempt = useCallback(async () => {
    setShowProfileModal(false)
    if (isPopupMode) return

    if (wsSystemErrorRef.current) {
      wsSystemErrorRef.current = false
      const result = await Swal.fire({
        text: t("sessionExpiredMessage"),
        confirmButtonText: t("confirmChanges"),
        allowOutsideClick: false,
      })
      if (result.isConfirmed) {
        clearFromStorage()
        window.location.href = ROUTES.SHIKSHALOKAM_HOME_PAGE
      }
      return
    }

    function onYesButtonClick() {
      try {
        let chat_history = getChatHistory()
        if (Array.isArray(chat_history)) {
          chat_history = chat_history.filter((chat, index) => !(index == chat_history.length - 1 && chat.source === "user"))
        }
        setChatHistory(chat_history)

        if (chat_history?.length === 1) {
          setShowHomepage(true)
        }

        resetReconnectCountRef.current()
        window.location.reload()
      } catch (error) {
        console.error("Error cleaning chat history before reload:", error)
        resetReconnectCountRef.current()
        window.location.reload()
      }
    }

    function onNoButtonClick() {
      clearFromStorage()
      window.location.href = ROUTES.SHIKSHALOKAM_HOME_PAGE
    }

    showConfirmationPopup(onYesButtonClick, onNoButtonClick)
  }, [isPopupMode, t])

  const onWebSocketClose = useCallback(event => {
    console.log("closed", event)
  }, [])

  const onWebSocketError = useCallback(error => {
    console.error("error", error)
  }, [])

  const onWebSocketOpen = useCallback(() => {
    const chat_history = getChatHistory().filter(msg => msgBelongsToFlow(msg, storageFlow))
    if (chat_history.filter(chat => chat.source === "user").length < 1) return
    if (!flowInfo) return

    // Discard any partially accumulated text from the dropped connection.
    // Without this, replay chunks from the server would append onto stale text
    // and produce a corrupted duplicate entry in chatHistory.
    streamingBotMessageRef.current = null

    sendSocketMessage({
      type: "authenticate",
      sessionid: sessionId,
      profileid: profileToUse,
      projectid: "",
      taskid: searchParams.get("taskId") || taskId,
      access_token: accessToken,
      route: chatLanguage,
      bot_route: botRoute,
      flow_name: storageFlow,
    })
  }, [sessionId, profileToUse, searchParams, taskId, accessToken, chatLanguage, storageFlow, botRoute, flowInfo])


  
  const completeProfileExtraction = useCallback(() => {
    if (profileCompletedRef.current) return
    profileCompletedRef.current = true
    updateShowHomepage(false)

    // Stop TTS from re-playing earlier sentences (audio queue flush).
    setSentences(prev => prev.map(s => ({ ...s, isNarrated: true })))
    // Write the thank-you bubble directly into chatHistory.
    // getChatHistory / setChatHistory are stable Zustand getState() refs — safe
    // to call inside a []‑dep callback.
    const currentHistory = getChatHistory()
    setChatHistory([
      ...currentHistory,
      {
        msg: t("profileOnboardingCompleteMessage"),
        source: "bot",
        updated_at: Date.now(),
        received: true,
        flowType: storageFlow,
      },
    ])
    onProfileExtractedRef.current?.()
  }, [t])

  const onWebSocketMessage = useCallback(
    event => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }

      if (data?.error === true && data?.source === env.WS_ERROR_SOURCE()) {
        wsSystemErrorRef.current = true
        return
      }

      if (data?.event === env.WS_IDLE_TIMEOUT_EVENT() && data?.source === env.WS_IDLE_TIMEOUT_SOURCE()) {
        setShowProfileModal(false)
        markIntentionalCloseRef.current()
        setTimeout(() => resetIntentionalCloseRef.current(), 500)
        onFinalReconnectAttempt()
        return
      }

      if (isPopupMode && data?.profile_extracted === true) {
        completeProfileExtraction()
        return
      }
  
      const message = data["text"]
  
      if (!message) return
  
      if (message.source === "bot") {
        setIsStreamingComplete(false)

        setSentences(prevSentences => {
          const updatedSentences = structuredClone(prevSentences)
          const lastSentence = updatedSentences[updatedSentences.length - 1]

          if (lastSentence?.source === "bot") {
            if (message?.msg) {
              lastSentence.message += message?.msg
            }
          } else {
            updatedSentences.push({
              message: message?.msg || "",
              source: "bot",
              isNarrated: false,
              id: Date.now(),
            })

            lastBotMessageIndex.current = updatedSentences.length - 1
          }

          return updatedSentences
        })

        // Accumulate streamed text so we can commit the full message to chatHistory
        // in one shot at finish_reason, decoupled from the TTS pipeline.
        if (streamingBotMessageRef.current) {
          streamingBotMessageRef.current.text += message?.msg || ""
        } else {
          streamingBotMessageRef.current = { text: message?.msg || "", id: Date.now() }
        }

        handleScrollToView()
      } else {
        setIsStreamingComplete(true)
      }
  
      if (message.source === "user") {
        const chat_history = getChatHistory()
        const updated_chat_history = chat_history.map(chat => {
          if (!chat.received && chat.msg === message.msg && msgBelongsToFlow(chat, storageFlow)) {
            return { ...chat, received: true }
          }

          return chat
        })

        setChatHistory(updated_chat_history)

        if (pendingNewChatRef.current) {
          pendingNewChatRef.current = false
          if (pendingNewChatTimerRef.current) {
            clearTimeout(pendingNewChatTimerRef.current)
            pendingNewChatTimerRef.current = null
          }
          window.location.reload()
        }
      }
  
      if (message.finish_reason === "stop" && message.source === "bot") {
        setStrandStep(message?.step)
        handleScrollToView()
        setTalking(0)
        hasStreamedRef.current = true
        setIsStreamingComplete(true)

        const streamedMsg = streamingBotMessageRef.current
        streamingBotMessageRef.current = null

        const targetTempId = streamedMsg?.id
        const targetSessionId = sessionId

        // Commit the fully streamed bot message to chatHistory immediately, before
        // TTS runs. This decouples UI display from the audio pipeline entirely.
        // Guard against replay duplicates (iOS reconnect): skip if a bot message
        // with identical text already exists in recent history.
        if (streamedMsg && !(isPopupMode && message?.extra_content?.profile_extracted === true)) {
          const currentHistory = getChatHistory()
          const flowHistory = currentHistory.filter(msg => msgBelongsToFlow(msg, storageFlow))
          const lastEntry = flowHistory[flowHistory.length - 1]
          const isReplayDuplicate = lastEntry?.source === "bot" && lastEntry?.msg === streamedMsg.text
          if (!isReplayDuplicate) {
            const botMessage = createMessage({
              msg: streamedMsg.text,
              source: "bot",
              received: true,
              updated_at: targetTempId,
              flowType: storageFlow,
            })
            if (message?.extra_content) {
              botMessage.extra_content = message.extra_content
            }
            setChatHistory([...currentHistory, botMessage])
          }
        }

        // Fetch DB companychat id for the session to ensure companyChatId is updated with the real DB record id
        if (targetSessionId && targetTempId) {
          setTimeout(async () => {
            try {
              if (useChatStorage.getState().sessionId !== targetSessionId) return
              const freshData = await getChatsFromDB(targetSessionId)
              const results = Array.isArray(freshData?.results) ? freshData.results : (Array.isArray(freshData) ? freshData : [])
              if (results.length > 0) {
                const sorted = quickSort(results, compareById)
                const lastBotDbChat = [...sorted].reverse().find(c => c?.sender?.id === 1 || c?.role === CHAT_SOURCE.BOT)
                if (lastBotDbChat && lastBotDbChat.id) {
                  if (useChatStorage.getState().sessionId !== targetSessionId) return
                  const currentHistory = getChatHistory()
                  if (Array.isArray(currentHistory) && currentHistory.length > 0) {
                    const targetIndex = currentHistory.findIndex(c => c?.updated_at === targetTempId)
                    if (targetIndex !== -1) {
                      const updated = [...currentHistory]
                      updated[targetIndex] = {
                        ...updated[targetIndex],
                        updated_at: lastBotDbChat.id,
                      }
                      setChatHistory(updated)
                    }
                  }
                }
              }
            } catch (err) {
              console.error("Error fetching companychat DB id:", err)
            }
          }, 600)
        }

        if (isPopupMode && message?.extra_content?.profile_extracted === true) {
          completeProfileExtraction()
        }
      }
    },
    [isPopupMode, completeProfileExtraction, t, onFinalReconnectAttempt]
  )

  const isShikshalokamPublicType = true
  const shouldShowChatHistoryFeature = true

  // ========== useMemo Hooks ==========

  // Filter chat history to only show messages for the current flow type.
  // Untagged (legacy) messages are treated as main-flow data and excluded
  // from profile flows so old history never leaks into the profile popup.
  const filteredChatHistory = useMemo(() => {
    if (!storageFlow) return chatHistory
    return chatHistory.filter(msg => msgBelongsToFlow(msg, storageFlow))
  }, [chatHistory, storageFlow])

  const isInitialising = useMemo(() => {
    // In popup mode, don't gate on filteredChatHistory — the popup fetches its
    // own intro independently and the shared store may not have profile-flow
    // messages yet.  We only need a sessionId to proceed.
    if (isPopupMode) return !sessionId
    return !sessionId || filteredChatHistory?.length === 0
  }, [sessionId, filteredChatHistory, isPopupMode])

  const webSocketUrl = useMemo(() => {
    return `${env.WS_PROTOCOL()}://${env.WEBSOCKET_HOST()}/${flowInfo ? flowInfo.websocket_url : ""}`
  }, [flowInfo])

  const {
    sendMessage: sendSocketMessage,
    connect: connectToWebSocket,
    disconnect: disconnectFromWebSocket,
    isConnected: isSocketConnected,
    resetReconnectCount,
    markIntentionalClose,
    resetIntentionalClose,
  } = useChatWebhook(webSocketUrl, {
    onOpen: onWebSocketOpen,
    onMessage: onWebSocketMessage,
    onClose: onWebSocketClose,
    onError: onWebSocketError,
    onFinalReconnectAttempt,
    autoConnect: false,
  })

  resetReconnectCountRef.current = resetReconnectCount
  markIntentionalCloseRef.current = markIntentionalClose
  resetIntentionalCloseRef.current = resetIntentionalClose
  useEffect(() => {
    return () => {
      if (isPopupMode) {
        disconnectFromWebSocket()
      }
    }
  }, [isPopupMode, disconnectFromWebSocket])

  useEffect(() => () => clearTimeout(pendingNewChatTimerRef.current), [])

  // ========================================================================
  // SECTION: Helper Functions (Must be defined before callbacks that use them)
  // These helper functions are used by callbacks and must be defined first
  // ========================================================================

  /**
   * Adds user messages to chat history
   * Creates and appends user message to conversation
   */
  const handleMessagesForUser = sentence => {
    const currentHistory = getChatHistory()
    const chat_history = [
      ...currentHistory,
      createMessage({
        msg: sentence,
        source: "user",
        flowType: storageFlow,
      }),
    ]
    setChatHistory(chat_history)

    return chat_history
  }

  /**
   * Stops audio playback and resets TTS state
   * Clears sentences queue and allows next audio to play
   */
  const handleOnStopSpeaking = async () => {
    try {
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort()
        ttsAbortRef.current = null
      }
      try {
        if (audioRef.current) await audioRef.current.pause()
      } catch (error) {
        console.error({ error })
      }
      setHasOverRideId(null)
      setSentences([])
      setIsNextAllowed(true)
    } catch (error) {
      console.error({ error })
    }
  }

  /**
   * Transforms chat data from API into sentences and chat history format
   * @param {Object} chat - Chat object from API
   * @param {string} introMessage - The intro message to skip duplicates
   * @returns {Object|null} Transformed message object or null if should be skipped
   */
  const transformChatMessage = (chat, introMessage) => {
    // Skip intro message duplicates
    if (String(chat?.id).startsWith("intro_msg_id") || chat?.message === introMessage) {
      return null
    }




    // Use translated message if available
    const messageToUse = chat?.translated_message && chat?.translated_message !== "" ? chat?.translated_message : chat?.message

    const isBot = chat?.sender?.id === 1

    return {
      sentence: {
        message: isBot ? messageToUse : chat?.message,
        source: isBot ? "bot" : "user",
        isNarrated: true,
        id: chat?.id,
      },
      chatHistory: {
        msg: isBot ? messageToUse : chat?.message,
        source: isBot ? "bot" : "user",
        updated_at: chat?.id,
        received: true,
        flowType: storageFlow,
        thumbs_up: chat?.thumbs_up,
        thumbs_down: chat?.thumbs_down,
        ...(isBot && chat?.other_params?.extra_content != null ? {
          extra_content: chat.other_params.extra_content,
        } : {}),
      },
    }
  }

  /**
   * Comparison functions for sorting by ID
   */
  function compareById(a, b) {
    return a.id - b.id
  }


  /**
   * Quick sort implementation for sorting arrays
   * @param {Array} arr - Array to sort
   * @param {Function} compare - Comparison function
   * @returns {Array} Sorted array
   */
  function quickSort(arr, compare) {
    if (arr?.length <= 1) {
      return arr
    }

    const pivot = arr[0]
    const left = []
    const right = []

    for (let i = 1; i < arr?.length; i++) {
      if (compare(arr[i], pivot) < 0) {
        left.push(arr[i])
      } else {
        right.push(arr[i])
      }
    }

    return [...quickSort(left, compare), pivot, ...quickSort(right, compare)]
  }

  /**
   * Sends user message through WebSocket connection
   * Handles message submission, WebSocket connection, and UI updates
   */
  async function handleSendMessage(event, overrideText) {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    // overrideText is used by quick-reply chips to send directly without touching textMessage
    const messageToSend = (overrideText ?? textMessage)?.trim() || ""

    try {
      await validateToken()
    } catch {
      return false
    }
    if (checkIsOffline()) return false

    setLlmError("")
    handleOnStopSpeaking()

    updateShowHomepage(false)
    setIsMute(true)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (!messageToSend) return false

    const chat_history = handleMessagesForUser(messageToSend)
    const userMsgCount = chat_history.filter(chat => chat.source === "user").length
    if (userMsgCount === 1 || !isSocketConnected) {
      connectToWebSocket()
      sendSocketMessage({
        type: "authenticate",
        sessionid: sessionId,
        profileid: profileToUse,
        projectid: "",
        taskid: searchParams.get("taskId") || taskId,
        access_token: accessToken,
        route: chatLanguage,
        bot_route: botRoute,
        flow_name: storageFlow,
      })
    }
    if (showHistorySidebar) {
      const firstMsg = messageToSend
      if (userMsgCount === 1) {
        try {
          const stored = JSON.parse(localStorage.getItem("__session_titles") || "{}")
          stored[sessionId] = firstMsg
          localStorage.setItem("__session_titles", JSON.stringify(stored))
        } catch {}
      }
      setChatTitle(prev => {
        const idx = prev.findIndex(item => item.session === sessionId)
        if (idx >= 0) {
          const updated = userMsgCount === 1 ? { ...prev[idx], title: firstMsg } : prev[idx]
          return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)]
        }
        return [{ session: sessionId, title: firstMsg }, ...prev]
      })
    }
    sendSocketMessage({
      text: messageToSend,
      context: "",
      asr_audio: asrAudio,
    })

    setAsrAudio(null)
    handleScrollToView()
    // Only clear the textarea when the message came from it (not from a chip)
    if (!overrideText) {
      setTextMessage("")
      // Dismiss chips by recording the actual bot message ID that had chips.
      // Using Date.now() would fail to match when the next bot reply has no chips
      // (lastBotMsg would still point to the old message and chips would reappear).
      const currentHistory = getChatHistory()
      const lastBotWithChips = [...currentHistory].reverse().find(
        chat => chat.source === CHAT_SOURCE.BOT && Array.isArray(chat.extra_content?.quick_reply_chips) && chat.extra_content.quick_reply_chips.length > 0
      )
      if (lastBotWithChips) setQuickReplySentForMsgId(lastBotWithChips.updated_at)
    }
    return true
  }

  // ========================================================================
  // SECTION: Message & Chat Handling Callbacks
  // These callbacks manage sending messages and fetching chat history
  // ========================================================================

  /**
   * Fetches company chat history for the current session
   * Transforms and batches chat messages to avoid duplicates
   */
  const handleCompanyChatCall = useCallback(async () => {
    // Profile onboarding popup is always a fresh conversation — never load
    // DB history, which belongs to the main chat's session and cannot be
    // distinguished by flow type.  The popup's conversation comes purely
    // from the WebSocket intro message + live Q&A.
    if (isPopupMode) {
      if (accessToken) setIsLoading(false)
      return
    }

    try {
      // Use the Zustand getter so both the initial guard and the pre-write
      // guard read the live store value, not a stale closure snapshot.
      // This prevents two concurrent invocations (triggered by both the
      // [isOldChatOpen,introMessage,chatHistory,sentences] effect and the
      // [companyBotData,introMessage,flowInfo] effect when introMessage
      // becomes truthy) from each independently passing the guard and
      // writing duplicate history.
      // Check only real messages (not intro) for the current flow so the
      // profile popup can independently load its own chat history.
      // Exclude intro messages — they are placeholders, not DB history.
      const flowHistory = getChatHistory().filter(
        msg => msgBelongsToFlow(msg, storageFlow) && !String(msg.updated_at).startsWith("intro_msg_id")
      )
      if (flowHistory.length >= 1) {
        return
      }

      try {
        const freshData = await getChatsFromDB(sessionId)
        const sortedResult = quickSort(Array.isArray(freshData?.results) ? freshData.results : [], compareById)
        const intro_message = introMessage

        // Collect all new sentences and chat history items
        const newSentences = []
        const newChatHistoryItems = []

        // Use Set with IDs for reliable duplicate detection
        const existingChatIds = new Set(getChatHistory().map(msg => msg.updated_at))

        // Add intro message if it exists and not already in history
        if (intro_message && !existingChatIds.has("intro_msg_id")) {
          newSentences.push({
            message: intro_message,
            source: "bot",
            isNarrated: true,
            id: "intro_msg_id",
          })

          newChatHistoryItems.push({
            msg: intro_message,
            source: "bot",
            updated_at: "intro_msg_id",
            received: true,
            flowType: storageFlow,
          })
        }

        // Process all chat messages
        sortedResult.forEach(chat => {
          const transformed = transformChatMessage(chat, intro_message)
          if (!transformed) {
            return // Skip duplicates
          }

          // Only add if not already in chat history
          if (!existingChatIds.has(transformed.chatHistory.updated_at)) {
            newSentences.push(transformed.sentence)
            newChatHistoryItems.push(transformed.chatHistory)
          }
        })

        // Batch state updates - update all at once
        if (newSentences.length > 0) {
          setSentences(prev => [...prev, ...newSentences])
        }

        if (newChatHistoryItems.length > 0) {
          console.log("filteredItems: ", newChatHistoryItems)
          // Re-read current state before writing; a concurrent invocation
          // may have already written the history between our guard check
          // and this point.
          const currentHistory = getChatHistory()
          const currentFlowHistory = currentHistory.filter(
            msg => msgBelongsToFlow(msg, storageFlow) && !String(msg.updated_at).startsWith("intro_msg_id")
          )
          if (currentFlowHistory.length >= 1) return
          setChatHistory([...currentHistory, ...newChatHistoryItems])
          lastBotMessageIndex.current += newChatHistoryItems.length
        }
      } catch (error) {
        console.error("Error fetching company chat data:", error)
      } finally {
        // setIsFetchingOldIntro(false)
        if (accessToken) {
          setIsLoading(false)
        }
      }
    } catch (error) {
      console.error("Error fetching company chat data:", error)
    } finally {
      // setIsFetchingOldIntro(false)
      if (accessToken) {
        setIsLoading(false)
      }
    }
  }, [introMessage, sessionId])

  /**
   * Handles chat session button clicks from sidebar
   * Loads selected chat session or fetches intro for new session
   */
  const handleChatSessionButtonClick = useCallback(async () => {
    if (!flowInfo) return
    lastBotMessageIndex.current = -1
    try {
      await handleCompanyChatCall()
    } catch (error) {
      console.error(error)
      // setIsIntroLoading(false)
    }
  }, [sessionId, flowInfo, introMessage, handleCompanyChatCall])

  useEffect(() => {
    if (!isFlowInfoError) return
    if (isPopupMode) return

    if (flowInfoError?.response?.status === 404) {
      clearFromStorage()
      navigate(ROUTES.SHIKSHALOKAM_HOME_PAGE)
    }
  }, [flowInfoError, isFlowInfoError, isPopupMode])

  useEffect(() => {
    // Popup mode is a temporary overlay; it must not overwrite the main
    // chat's persistent flow registration in the shared Zustand store.
    if (isPopupMode) return
    setStorageFlow(storageFlow)
  }, [storageFlow, isPopupMode])

  useEffect(() => {
    if (isPopupMode) {
      // Popup manages its own homepage state locally.
      if (filteredChatHistory.length > 1) {
        setPopupShowHomepage(false)
      }
      return
    }
    if (filteredChatHistory.length > 1) {
      setShowHomepage(false)
      setIsOldChatOpen(true)
      setIsNewChatOpen(false)
    } else {
      setShowHomepage(true)
    }
  }, [filteredChatHistory, isPopupMode])

  // ========================================================================
  // SECTION: Variable Definitions
  // ========================================================================
  // const { access_token } =  getStorageSlice(STORE_NAME_CONSTANTS.USER_DATA, 'localStorage').getState();
  let isMobile = useCustomMediaQuery("(max-width: 500px)")

  useEffect(() => {
    if (!introMessageData || introMessageData?.length === 0) return

    let message = introMessageData[0]?.introductory_message
    if (profileToUse && firstName && firstName !== "null" && firstName !== "") {
      message = introMessageData[0]?.introductory_message
    } else {
      message = introMessageData[0]?.alt_introductory_message
    }
    const botName = introMessageData[0]?.name || "Bot"

    setBotName(botName)
    setBotNameToDisplay(botName)

    if (isOldChatOpen) {
      getSessionInfo().then(sessionInfo => {
        if (sessionInfo && sessionInfo.length > 0) {
          setStrandStep(sessionInfo[0]?.current_step)
        }
      })
    }
    if (message && firstName) {
      const words = message.split(" ")
      words.splice(1, 0, firstName)
      message = words.join(" ")
    }
    const isRestoringOldChat = isOldChatOpen && getChatHistory().filter(
      msg => msgBelongsToFlow(msg, storageFlow) && !String(msg.updated_at).startsWith("intro_msg_id")
    ).length > 0
    // Use a flow-specific intro ID so each flow (main vs profile popup) gets its own entry.
    const introId = isPopupMode ? `intro_msg_id_${storageFlow}` : "intro_msg_id"
    if (!isRestoringOldChat && message && !!message?.trim() && filteredChatHistory[filteredChatHistory?.length - 1]?.msg !== message && !sentences.some(msg => msg.message === message)) {
      setIntroMessage(message)
      setSentences(prev => [
        ...prev,
        {
          message: message,
          isNarrated: false,
          id: introId,
        },
      ])
      const currentHistory = getChatHistory()
      if (!currentHistory.some(c => c.updated_at === introId)) {
        setChatHistory([...currentHistory, { msg: message, source: "bot", updated_at: introId, received: true, flowType: storageFlow }])
      }
      setHasOverRideId(introId)
      setIsMute(false)
      setIsNextAllowed(true)
    } else if (isRestoringOldChat && message) {
      setIntroMessage(message)
    }

    setShouldFetchIntro(false)
    setIsLoading(false)
  }, [introMessageData])


  useEffect(() => {
    if (!companyBotData) return
    if (!flowInfo) return

    const bots = companyBotData?.results
    let storedRoute = botRoute

    if (!bots || bots.length === 0) {
      handleScrollToView()
      return
    }

    const selectedBot = bots.find(bot => bot.route === storedRoute) || bots[0] || { route: "/" }
    if (selectedBot?.statemachine_length) {
      setStateMachineLength(selectedBot.statemachine_length)
    }

    // Find the latest bot based on flow type
    const latestBot = bots.find(bot => bot.route === storedRoute)
    if (!latestBot) {
      handleScrollToView()
    }

    if (!storageFlow || ![sessionFlowName.LoginMiStory].includes(storageFlow)) {
      handleCompanyChatCall()
    }

  }, [companyBotData, introMessage, flowInfo])

  // ========================================================================
  // SECTION: Lifecycle & Browser Events (Execution Order: 1 - On Mount)
  // These effects run once when component mounts and set up event listeners
  // ========================================================================

  /**
   * Network monitoring - detects online/offline status and connection speed

  /**
   * Browser back button handling - intercepts browser navigation
   * Shows guest popup for special flows or navigates to previous page
   */
  useEffect(() => {
    if (isPopupMode) return

    const currentFlow = storageFlow
    const handleBack = () => {
      if (isLogoutNavigationRef.current) return
      if (currentFlow) {
        if (ssoNavigationTriggered && accessToken) {
          navigate(-2)
        } else {
          navigateBack()
        }
      } else {
        setLanguage(languageList[0].value)
        setChatLanguage(languageList[0].value)
        stopAllAudio()
        navigate(ROUTES.SHIKSHALOKAM_HOME_PAGE, { replace: true })
      }
    }

    if (!window.history.state?.isCustom) {
      window.history.replaceState({ isCustom: true }, "", window.location.href)
    }

    window.addEventListener("popstate", handleBack)

    return () => {
      window.removeEventListener("popstate", handleBack)
    }
  }, [navigate, isPopupMode])

  // ========================================================================
  // SECTION: Initial Configuration (Execution Order: 2 - On Mount & Specific Deps)
  // These effects initialize component state and configuration on mount
  // ========================================================================

  /**
   * Initialize bot name display from storage
   * Updates bot name when available in storage
   */
  useEffect(() => {
    if (botName && botName?.trim()) {
      setBotNameToDisplay(botName)
    }
  }, [botName])

  /**
   * Initialize new chat state based on existing chat history
   * Sets isNewChatOpen flag if chat history is present
   */
  useEffect(() => {
    if (isPopupMode) return
    if (filteredChatHistory?.length !== 0) {
      setIsNewChatOpen(true)
    }
  }, [])

  // ========================================================================
  // SECTION: User Profile & Authentication (Execution Order: 3 - On Token Available)
  // These effects handle user authentication and profile creation
  // ========================================================================

  useEffect(() => {
    if (!profileToUse && accessToken) {
      setShouldFetchIntro(true)
      setIsStreamingComplete(true)
    }
  }, [accessToken, profileToUse])

  /**
   * Initialize popup mode: generate session and open new chat.
   * On fresh start: creates a new session and opens new chat.
   * On reload (existing session + history): restores as old chat without replaying intro.
   * Runs when popup renders with an already-known profile (chat-container bypassed)
   */
  useEffect(() => {
    if (!isPopupMode) return
    if (!accessToken || !profileToUse) return

    ;(async () => {
      try {
        setIsLoading(true)
        const existingHistory = getChatHistory()
        if (!sessionId) {
          removeChatHistory()
          const session = await getSessionDetails()
          setSessionId(session.sessionid)
          setIsOldChatOpen(false)
          setIsNewChatOpen(true)
          setShowHomepage(true)
        } else if (existingHistory.length > 0) {
          // Reload mid-onboarding: restore existing conversation
          setIsOldChatOpen(true)
          setIsNewChatOpen(false)
        } else {
          setIsOldChatOpen(false)
          setIsNewChatOpen(true)
          setShowHomepage(true)
        }
        setShouldFetchIntro(true)
        setIsStreamingComplete(true)
      } catch (error) {
        console.error("[DynamicVoiceChat popup] session init failed:", error)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [isPopupMode, accessToken, profileToUse])

  // ========================================================================
  // SECTION: Session & Chat Configuration (Execution Order: 4 - After Auth)
  // These effects manage session state, chat visibility, and bot configuration
  // ========================================================================

  /**
   * Set up public type configuration and trigger intro fetch
   * Enables intro message fetching for public/guest flows
   */
  useEffect(() => {
    if (isShikshalokamPublicType) {
      setShouldFetchIntro(true)
      setIsStreamingComplete(true)
    }
  }, [isShikshalokamPublicType])

  /**
   * Initialize i18next language and trigger intro fetch.
   * On new chat (empty session storage): clears state and fetches intro.
   * On refresh (session storage has history): syncs language, preserves chat.
   */
  useEffect(() => {
    if (!chatLanguage || !storageFlow) return
    setLanguage(chatLanguage)

    // Check only messages for the current flow, so the profile popup
    // still fetches its own intro even when the main chat has history.
    // Exclude intro placeholder messages — they don't represent real conversation state.
    const flowHistory = getChatHistory().filter(
      msg => msgBelongsToFlow(msg, storageFlow) && !String(msg.updated_at).startsWith("intro_msg_id")
    )
    if (flowHistory.length > 0) return

    stopAllAudio()
    isIntroPlayed.current = false
    setSentences([])
    setAudioCache({})
    setShouldFetchIntro(true)
  }, [chatLanguage, storageFlow])

  /**
   * Handle chat history feature visibility and homepage display
   * Controls homepage vs chat view based on new/old chat state
   */
  useEffect(() => {
    if (shouldShowChatHistoryFeature) {
      if (isOldChatOpen === true) {
        setShouldFetchIntro(true)
        // Only hide homepage if there are real conversation messages beyond the intro
        // for the active flow — prevents messages from other flows from toggling state.
        const hasRealMessages = filteredChatHistory.some(c => !String(c.updated_at).startsWith("intro_msg_id"))
        if (isPopupMode) {
          setPopupShowHomepage(!hasRealMessages)
        } else {
          setShowHomepage(!hasRealMessages)
        }
      } else if (isNewChatOpen === true) {
        if (isPopupMode) {
          setPopupShowHomepage(true)
        } else {
          setShowHomepage(true)
        }
      }
    } else {
      removeChatHistory()
    }
  }, [isOldChatOpen, isNewChatOpen, filteredChatHistory, isPopupMode])

  /**
   * Fetch chat session when old chat is opened
   * Loads existing conversation when user selects from history
   */
  useEffect(() => {
    const realMessages = filteredChatHistory?.filter(c => !String(c.updated_at).startsWith("intro_msg_id")) ?? []
    if (isOldChatOpen === true && introMessage && realMessages.length === 0 && sentences?.length === 0) {
      handleChatSessionButtonClick()
    }
  }, [isOldChatOpen, introMessage, filteredChatHistory, sentences])

  const hasScrolledToBottomRef = useRef(false)
  useEffect(() => {
    hasScrolledToBottomRef.current = false
    setActiveSourcesChatId(null)
    setActiveSources([])
  }, [sessionId])
  useEffect(() => {
    if (isOldChatOpen === true && filteredChatHistory?.length > 0 && !hasScrolledToBottomRef.current) {
      hasScrolledToBottomRef.current = true
      const scrollTimer = setTimeout(() => handleScrollToView(), 100)
      return () => clearTimeout(scrollTimer)
    }
  }, [isOldChatOpen, filteredChatHistory])

  /**
   * Load chat history sidebar sessions when profile and flow are ready
   */
  useEffect(() => {
    if (isTokenValidated && showHistorySidebar && profileToUse && storageFlow) {
      showChatTitle()
    }
  }, [isTokenValidated, profileToUse, storageFlow, showHistorySidebar])

  // ========================================================================
  // SECTION: Language & Bot Setup (Execution Order: 5 - When Profile Ready)
  // These effects fetch bot information and set up language-specific configuration
  // ========================================================================




  // ========================================================================
  // SECTION: UI State Management (Execution Order: 7 - Throughout Lifecycle)
  // These effects manage UI state, modals, and visual feedback
  // ========================================================================

  /**
   * Control body scroll overflow based on loading and modal states
   * Prevents background scrolling when modals or loaders are active
   */
  useEffect(() => {
    if (isLoading) {
      document.body.style.overflowY = "hidden"
    } else {
      document.body.style.overflowY = "auto"
    }

    return () => {
      document.body.style.overflowY = "auto"
    }
  }, [isLoading])

  /**
   * Track voice recording duration with timer
   * Updates recording time counter every second during recording
   */
  useEffect(() => {
    if (hasStartedRecording) {
      const id = setInterval(() => {
        setSeconds(prev => prev + 1)
      }, 1000)
      setIntervalId(id)
    } else {
      clearInterval(intervalId)
      setSeconds(0)
    }

    return () => clearInterval(intervalId)
  }, [hasStartedRecording])

  /**
   * Dynamically adjust textarea height based on content
   * Provides better UX by expanding textarea as user types
   */
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = "auto"
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`
    }
  }, [textMessage])

  // ========================================================================
  // SECTION: Chat History & Messages (Execution Order: 8 - During Conversation)
  // These effects manage chat messages, recordings, and scroll behavior
  // ========================================================================

  /**
   * Update chat history index and trigger scroll to view
   * Keeps track of last bot message and scrolls to latest message
   */
  useEffect(() => {
    lastBotMessageIndex.current = filteredChatHistory?.length - 1
    if (!(isOldChatOpen && !hasScrolledToBottomRef.current)) handleScrollToView()
  }, [filteredChatHistory])

  /**
   * Attach audio recordings to user messages in chat history
   * Updates latest user message with voice recording data
   */
  useEffect(() => {
    const lastMsg = filteredChatHistory[filteredChatHistory?.length - 1]
    if (!!recordings?.length && lastMsg?.source !== "bot") {
      const updatedChatHistory = [...chatHistory]
      // Find the index of the last filtered message in the full chatHistory
      const fullIndex = chatHistory.lastIndexOf(lastMsg)
      if (fullIndex !== -1) {
        updatedChatHistory[fullIndex] = {
          ...updatedChatHistory[fullIndex],
          recording: recordings[recordings?.length - 1],
        }
      }
      setChatHistory(updatedChatHistory)
    }
    return () => {}
  }, [recordings, filteredChatHistory])


  // ========================================================================
  // SECTION: Audio & TTS Management (Execution Order: 9 - During Message Playback)
  // These effects handle text-to-speech, audio playback, and speaker controls
  // ========================================================================

  /**
   * Control audio mute/unmute state
   * Toggles audio muting based on user preference
   */
  useEffect(() => {
    if (audioRef?.current) {
      if (isMute) {
        audioRef.current.muted = true
      } else {
        audioRef.current.muted = false
      }
    }
  }, [isMute])

  // Persist speaker preference to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('saathi_speaker_enabled', String(speakerEnabled))
    } catch {}
  }, [speakerEnabled])

  /**
   * Auto-play audio for bot messages when streaming completes
   * Automatically triggers TTS playback for new bot responses
   */
  useEffect(() => {
    let shouldPlay = false
    if (!isIntroMessageLoading && !isLoading) {
      const currentFlow = storageFlow

      if (currentFlow) {
        if (filteredChatHistory.length > 0) {
          if (isStreamingComplete && filteredChatHistory[filteredChatHistory.length - 1]?.source === "bot") {
            shouldPlay = true
          }
        } else {
          shouldPlay = true
        }
      } else if (filteredChatHistory && filteredChatHistory.length > 0 && filteredChatHistory[filteredChatHistory.length - 1]?.source === "bot" && !isIntroMessageLoading && !isLoading) {
        shouldPlay = true
      }
    }
    if (isStreamingComplete && hasStreamedRef.current && shouldPlay && !isLoading && isMute && !isIntroMessageLoading && speakerEnabled) {
      const speakerButtons = document.querySelectorAll(".button-11.button-3")
      const lastSpeakerButton = speakerButtons[speakerButtons.length - 1]

      if (lastSpeakerButton) {
        lastSpeakerButton.click()
      }
    }
  }, [isStreamingComplete, showHomepage, isLoading, filteredChatHistory, isMute, isIntroMessageLoading, speakerEnabled])

  /**
   * Process TTS requests for unnarrated bot messages
   * Converts text to speech for messages not yet played aloud
   */
  useEffect(() => {
    let unnarratedMessages = sentences.filter(x => !x?.isNarrated)
    let hasUnnarratedMessages = !!unnarratedMessages?.length
    let sourceLanguage = languageToUse
    if (isNextAllowed && hasUnnarratedMessages && !isLoading && flowInfo) {
      handleAI4BharatTTSRequest(unnarratedMessages[0].message, unnarratedMessages[0].id, sourceLanguage)
    }

    return () => {}
  }, [isNextAllowed, sentences, languageToUse, isLoading, flowInfo])

  const formatTime = secs => {
    const minutes = Math.floor(secs / 60)
    const seconds = secs % 60
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  const navigateBack = () => {
    stopAllAudio()
    setHasSelectedLanguage(false)
    navigate(ROUTES.SHIKSHALOKAM_HOME_PAGE, { replace: true })
  }

  async function downloadFileFromUrl(url, fileName, onError) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`)
      }
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = fileName || url.split("/").pop() || "download"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error("Download failed:", error)
      onError?.()
    }
  }

  async function resetChat(e) {
    if (e) {
      e.preventDefault()
    }

    try {
      await validateToken()
    } catch {
      return
    }

    // Capture before removeChatHistory() clears state.
    // m.received === false (strict) means sent via createMessage but not yet echoed by backend.
    // API-loaded messages have received: undefined and are excluded by strict equality.
    const hasUnacknowledgedSentMessages = getChatHistory().some(
      m => m.source === "user" && m.received === false
    )
    // Cancel any previous pending-reload from a rapid double-click on New Chat
    if (pendingNewChatTimerRef.current) {
      clearTimeout(pendingNewChatTimerRef.current)
      pendingNewChatTimerRef.current = null
    }
    pendingNewChatRef.current = false

    disconnectFromWebSocket()
    setIsLoading(true)
    removeChatHistory()
    setActiveSourcesChatId(null)
    setActiveSources([])
    setIsOldChatOpen(false)
    setIsNewChatOpen(true)
    setLlmError("")
    setSessionId(null)
    setStrandStep(null)
    const session = await getSessionDetails()
    setSessionId(session.sessionid)


    updateShowHomepage(true)
    setIsLoading(false)

    if (!isPopupMode) {
      if (hasUnacknowledgedSentMessages) {
        // First message is queued but backend hasn't echoed yet — session may not be
        // associated with this profile+flow. Defer reload until the echo confirms persistence.
        pendingNewChatRef.current = true
        pendingNewChatTimerRef.current = setTimeout(() => {
          if (pendingNewChatRef.current) {
            pendingNewChatRef.current = false
            window.location.reload()
          }
        }, 5000)
      } else {
        window.location.reload()
      }
    } else {
      setSentences([])
      const newSessionId = session.sessionid
      showChatTitle().then(() => {
        setChatTitle(prev => {
          if (prev.some(item => item.session === newSessionId)) return prev
          return [{ session: newSessionId, title: null }, ...prev]
        })
      })
    }
  }

  async function getSessionInfo() {
    let currentSession = sessionId
    try {
      const response = await getChatSessionApi({ sessionId: currentSession })
      return response?.data?.results
    } catch (error) {
      console.error("Error fetching AI4Bharat audio:", error)
      throw error
    }
  }

  // ========================================================================
  function handleScrollToView() {
    try {
      document?.querySelector("#last-chat-boundary")?.scrollIntoView({
        behavior: "smooth",
      })
    } catch (error) {
      console.error({ error })
    }
  }

  const handleOnInputText = e => {
    e.preventDefault()
    const value = e.target.value

    if (textMessage === "" && navigator.onLine && !isOffline) {
      validateToken().catch(() => {})
    }

    setTextMessage(value)

    if (value.trim() === "") {
      setIsRecognizing(false)
      setHasStartedListening(false)
    }
  }

  const handleAI4BharatTTSRequest = async (text, id, sourceLanguage) => {
    try {
      if (!botRoute) return

      // Skip autoplay TTS if browser blocked it; manual speaker clicks (hasOverRideId) still proceed
      if (ttsDisabledRef.current && !hasOverRideId) return

      if (String(id).startsWith("intro_msg_id")) {
        setSentences(prev => prev.map(x => ({ ...x, isNarrated: true })))
        setIsNextAllowed(true)
        setHasOverRideId(null)
        return
      }
      setIsNextAllowed(false)
      let cachedAudioUrl = audioCache[id]
      let audio_result = ""
      let audio

      if (!sourceLanguage) {
        sourceLanguage = "en"
      }

      let storedRoute = botRoute

      if (!speakerEnabled) {
        setSentences(prev => prev.map(x => ({ ...x, isNarrated: true })))
        setIsNextAllowed(true)
        setHasOverRideId(null)
        return
      }

      if (isMute && !hasOverRideId) {
        setSentences(prev => {
          let all_sentences = [...prev]
          return all_sentences.map(x => ({ ...x, isNarrated: true }))
        })
        setIsNextAllowed(true)
        setHasOverRideId(null)
        return
      }

      if (!cachedAudioUrl) {
        // Create an AbortController for this request so handleOnStopSpeaking can cancel it
        const controller = new AbortController()
        ttsAbortRef.current = controller
        try {
          audio_result = await getAI4BharatAudioApi(text, sourceLanguage, storedRoute, controller.signal)
        } catch (fetchError) {
          // AbortError means the user sent a message / stopped TTS — exit silently
          if (fetchError?.name === "AbortError" || fetchError?.code === "ERR_CANCELED") return
          throw fetchError
        } finally {
          // Clear the ref once the request settles (whether success, error, or abort)
          if (ttsAbortRef.current === controller) ttsAbortRef.current = null
        }
        if (audio_result?.length) {
          cachedAudioUrl = `data:audio/wav;base64,${audio_result}`
          setAudioCache(prevCache => ({
            ...prevCache,
            [id]: cachedAudioUrl,
          }))
        }
      }

      if (cachedAudioUrl) {
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
        }
        audioRef.current = new Audio(cachedAudioUrl)
        audio = audioRef.current

        audio.onplay = () => {
          setIsNextAllowed(false)
        }

        audio.onended = () => {
          setSentences(prev => {
            let all_sentences = JSON.parse(JSON.stringify([...prev]))
            let index = prev.findIndex(x => x.id === id)
            if (index > -1) all_sentences[index].isNarrated = true
            return all_sentences
          })
          setIsNextAllowed(true)
          setHasOverRideId(null)
        }

        try {
          await audio.play()
        } catch (error) {
          console.error("Error playing audio:", error)
          // If the browser blocked autoplay, disable TTS for this session
          if (error?.name === "NotAllowedError") {
            ttsDisabledRef.current = true
          }
          setSentences(prev => {
            let all_sentences = JSON.parse(JSON.stringify([...prev]))
            let index = prev.findIndex(x => x.id === id)
            if (index > -1) all_sentences[index].isNarrated = true
            return all_sentences
          })
          setIsNextAllowed(true)
          setHasOverRideId(null)
        }
      }
    } catch (error) {
      console.error("Error in handleAI4BharatTTSRequest:", error)
      handleOnStopSpeaking()
    }
  }

  const isTyping = !!textMessage.trim()

  const handleOnSpeaking = async (_text, id, staticMsg, _hasClickedOnSpeaker = false) => {
    try {
      try {
        if (!!audioRef.current) await audioRef.current.pause()
      } catch (error) {
        console.error({ error })
      }
      if (String(id).startsWith("intro_msg_id")) {
        isIntroPlayed.current = false
      }
      setHasOverRideId(id)
      setIsNextAllowed(true)
      const messageToPlay = staticMsg ? staticMsg : filteredChatHistory.find(message => message.updated_at === id)
      setSentences(() => [
        {
          message: messageToPlay?.msg,
          isNarrated: false,
          id: id,
        },
      ])
    } catch (error) {
      console.error({ error })
    }
  }

  const isSilentAudio = async (blob, silenceThreshold = 0.01) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const arrayBuffer = await blob.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const rawData = audioBuffer.getChannelData(0)

    const rms = Math.sqrt(rawData.reduce((acc, val) => acc + val * val, 0) / rawData.length)
    console.log("RMS (volume):", rms)

    return rms < silenceThreshold
  }

  const startRecording = async () => {
    if (checkIsOffline()) return
    try {
      await validateToken()
    } catch {
      return
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      handleOnStopSpeaking()
      setTextMessage("")
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(stream => {
          const options = {
            mimeType: "audio/webm;codecs=opus",
            audioBitsPerSecond: 16000,
          }
          const recorder = new MediaRecorder(stream, options)
          setMediaRecorder(recorder)

          const localAudioChunks = []

          recorder.start()
          setHasStartedRecording(true)

          recorder.ondataavailable = event => {
            localAudioChunks.push(event.data)
          }

          recorder.onstop = async () => {
            if (localAudioChunks.length > 0) {
              const audioBlob = new Blob(localAudioChunks, {
                type: "audio/webm;codecs=opus",
              })
              const isSilent = await isSilentAudio(audioBlob, 0.02)

              if (!audioBlob || isSilent) {
                showNotification({
                  message: t("asrError"),
                  type: "error",
                  options: {
                    position: "top-center",
                    autoClose: 6000,
                    closeButton: true,
                    style: { fontWeight: "bold" },
                  },
                })
                return
              }

              try {
                await validateToken()
              } catch {
                return
              }
              setIsFetchingData(true)
              let transcriptResult = ""
              let s3Url = await handleS3Upload(audioBlob, `${Date.now()}`, `chatbot/companychat/${sessionId}/`, null)
              if (!s3Url || s3Url === "") {
                transcriptResult = t("asrError")
              }
              setAsrAudio(s3Url)
              let storedRoute = botRoute
              transcriptResult = await ai4BharatASRApi(s3Url, languageToUse, storedRoute)
              if (!transcriptResult || transcriptResult === "") {
                showNotification({
                  message: t("asrError"),
                  type: "error",
                  options: {
                    position: "top-center",
                    autoClose: 6000,
                    closeButton: true,
                    style: { fontWeight: "bold" },
                  },
                })
              } else {
                setTextMessage(transcriptResult)
              }
              setIsFetchingData(false)
            } else {
              console.warn("No audio chunks were recorded.")
              setIsFetchingData(false)
            }
          }
        })
        .catch(err => {
          console.error("Error accessing microphone:", err)
          setIsFetchingData(false)
        })
    } else {
      console.warn("getUserMedia not supported on your browser!")
    }
  }

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop()
      setHasStartedRecording(false)
    }
  }

  const handleOpenProfileModal = async () => {
    if (checkIsOffline()) return
    setShowProfileModal(true)
    // Reuse profileApiData already fetched during validateToken/validateSession to avoid duplicate API calls
    if (!profileApiData) {
      try {
        const res = await validateSession()
        const details = res?.profile_details || {}
        if (details) {
          const normalized = extractUserProfileData(details, firstName)
          setProfileApiData(normalized)
          if (normalized.name) setFirstName(normalized.name)
        }
      } catch (error) {
        console.error("Error fetching profile via validateSession:", error)
        showNotification({
          message: t("profileFetchFailed"),
          type: "error",
        })
      }
    }
  }

  function handleLogout() {
    setShowLogoutConfirm(true)
  }

  async function handleSaveProfile(formValues) {
    try {
      await validateToken()
    } catch (error) {
      setShowProfileModal(false)
      console.error("Session validation failed before profile update:", error)
      return
    }

    const token = _userData?.access_token || accessToken
    const payload = {
      name: formValues.name ?? "",
      role: formValues.role ?? "",
      school_name: formValues.school_name ?? "",
      district: formValues.district ?? "",
      state: formValues.state ?? "",
    }

    try {
      const res = await updateUserProfileApi(payload, token)

      setFirstName(payload.name)
      setState(payload.state)

      if (_userData) {
        _userData.name = payload.name
        _userData.state = payload.state
        _userData.school_name = payload.school_name
        _userData.district = payload.district
        _userData.role = payload.role
      }

      setProfileApiData(prev => ({
        ...prev,
        ...payload,
        name: payload.name,
      }))

      showNotification({
        message: res?.message || t("profileUpdatedSuccess"),
        type: "success",
      })
      setShowProfileModal(false)
    } catch (error) {
      const message = t("profileUpdateFailed")
      showNotification({ message, type: "error" })
    }
  }

  async function handleConfirmLogout() {
    stopAllAudio()
    setShowLogoutConfirm(false)

    try {
      const res = await logoutApi(_userData?.access_token, _userData?.refresh_token)
      const isSuccess = res && (
        res.status === "ok"
      )
      if (!isSuccess) {
        const message = res?.message || t("logoutFailed") || "Logout failed"
        showNotification({ message, type: "error" })
        return
      }

    _userData = null // invalidate cache so next mount re-fetches fresh tokens from localStorage
    // sessionStorage survives clearFromStorage (which only resets Zustand stores).
    // Key is intentionally NOT removed — it must persist so that repeated login/logout
    // cycles in the same tab always navigate back to the original first-home position.
    // Deleting it caused window.history.length (which includes forward entries after
    // backward navigation) to be captured as the new baseline, making stepsBack ≈ 0
    // on the second logout.
    const firstHomeHistoryLength = parseInt(sessionStorage.getItem("__first_home_history_length"), 10)
    clearFromStorage()
    isLogoutNavigationRef.current = true
    if (Number.isFinite(firstHomeHistoryLength)) {
      navigate(-(window.history.length - firstHomeHistoryLength))
    } else {
      navigate(ROUTES.SHIKSHALOKAM_HOME_PAGE, { replace: true })
    }
    } catch (error) {
      if (error?.response?.status === 401) {
        _userData = null
        const firstHomeHistoryLength = parseInt(sessionStorage.getItem("__first_home_history_length"), 10)
        clearFromStorage()
        isLogoutNavigationRef.current = true
        if (Number.isFinite(firstHomeHistoryLength)) {
          navigate(-(window.history.length - firstHomeHistoryLength))
        } else {
          navigate(ROUTES.SHIKSHALOKAM_HOME_PAGE, { replace: true })
        }
      } else {
        const message = error?.response?.data?.message || error?.message || String(error)
        showNotification({ message, type: "error" })
        // Do not clear storage or navigate when logout API fails
      }
    }
  }

  function processSidebarResults(results) {
    const sessionTypeFilter = env.FLOW_NAME()
    let localTitles = {}
    try { localTitles = JSON.parse(localStorage.getItem("__session_titles") || "{}") } catch {}
    const items = results
      .filter(sessionObj => sessionObj.session_type !== env.PROFILE_FLOW_NAME() && (!sessionTypeFilter || sessionObj.session_type === sessionTypeFilter))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .map(sessionObj => {
        const title = sessionObj.title || localTitles[sessionObj.session] || null
        if (sessionObj.title && localTitles[sessionObj.session]) {
          delete localTitles[sessionObj.session]
        }
        return { session: sessionObj.session, title }
      })
    try { localStorage.setItem("__session_titles", JSON.stringify(localTitles)) } catch {}
    return items
  }

  async function showChatTitle() {
    try {
      const currentFlow = storageFlow
      const response = await getChatSessionApi({
        profile: profileToUse,
        flow: currentFlow,
      })
      if (response) {
        setChatTitle(processSidebarResults(response?.data?.results || []))
        setSidebarNextPageUrl(response?.data?.next || null)
      }
    } catch (error) {
      console.error("showChatTitle error:", error)
    }
  }

  async function loadMoreSessions() {
    if (!sidebarNextPageUrl || isLoadingMoreSessions || sidebarBottomReachedRef.current) return
    sidebarBottomReachedRef.current = true
    setIsLoadingMoreSessions(true)
    try {
      const response = await fetchChatSessionPageApi(sidebarNextPageUrl)
      if (response) {
        setChatTitle(prev => [...prev, ...processSidebarResults(response?.data?.results || [])])
        setSidebarNextPageUrl(response?.data?.next || null)
      }
    } catch (error) {
      console.error("loadMoreSessions error:", error)
    } finally {
      setIsLoadingMoreSessions(false)
    }
  }

  async function handleSessionSelect(selectedSessionId) {
    if (selectedSessionId === sessionId) return
    setActiveSourcesChatId(null)
    setActiveSources([])
    try {
      await validateToken()
    } catch {
      return
    }
    stopAllAudio()
    disconnectFromWebSocket()
    setSessionId(selectedSessionId)
    setChatHistory([])
    setSentences([])
    setIsOldChatOpen(true)
    setIsNewChatOpen(false)
    setShowHomepage(false)
    setLlmError("")
    setIsSidebarOpen(false)
  }

  return (
    <>
      <div style={hasActiveFlexLayout ? { display: "flex", flexDirection: "row", height: isPopupMode ? "100%" : "100dvh", overflow: "hidden", position: "relative" } : undefined}>      {/* ===== CHAT HISTORY SIDEBAR (popup mode, non-profile flows) ===== */}
      {showHistorySidebar && (
        <>
          {/* Mobile overlay backdrop */}
          {isSidebarOpen && (
            <div
              className="chat-sidebar-backdrop"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
          <aside className={`chat-sidebar${isMobile ? (isSidebarOpen ? " chat-sidebar--open" : " chat-sidebar--closed") : ""}`}>
            {/* Sidebar header */}
            <div className="chat-sidebar-header">
              <span className="chat-sidebar-title">{t("sidebarTitle")}</span>
              <button
                className="chat-sidebar-new-btn"
                onClick={async e => {
                  await resetChat(e)
                }}
              >
                <FiPlus style={{ marginRight: 3 }} /> {t("newChat")}
              </button>
            </div>

            {/* Empty state */}
            {(!chatTitle || chatTitle.length === 0) ? (
              <div className="chat-sidebar-empty">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p>{t("sidebarEmptyText")}</p>
              </div>
            ) : (
              <div className="chat-sidebar-sessions">
                <p className="chat-sidebar-recents-label">{t("recents")}</p>
                <div
                  className="chat-sidebar-sessions-scroll"
                  onScroll={e => {
                    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
                    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
                    if (distanceFromBottom < 150) {
                      loadMoreSessions()
                    } else {
                      sidebarBottomReachedRef.current = false
                    }
                  }}
                >
                  {chatTitle.map((item, index) => (
                    <div
                      key={index}
                      className={`chat-sidebar-session-item${item.session === sessionId ? " chat-sidebar-session-item--active" : ""}`}
                      onClick={() => handleSessionSelect(item.session)}
                      title={item.title || "Untitled chat"}
                    >
                      {item.title || "Untitled chat"}
                    </div>
                  ))}
                  {isLoadingMoreSessions && (
                    <div style={{ textAlign: "center", padding: "8px 0" }}>
                      <BiLoader className="loader-rotate-loader loader-icon" />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="chat-sidebar-footer">
              <div className="chat-sidebar-user-card">
              <button className="chat-sidebar-user-info-btn" onClick={handleOpenProfileModal}>
                <span className="chat-sidebar-user-avatar">
                  {((profileApiData?.name || firstName || t("user"))[0] || "U").toUpperCase()}
                </span>
                <span className="chat-sidebar-user-name">
                  {profileApiData?.name || firstName || t("user")}
                </span>
                </button>
                <button
                  className="chat-sidebar-logout-icon-btn"
                  onClick={handleLogout}
                  aria-label="Logout"
                  title={t("logout")}
                >
                <FiLogOut className="chat-sidebar-logout-icon" />
              </button>
              </div>
            </div>
          </aside>
          <Popup
            isOpen={showLogoutConfirm}
            togglePopup={() => setShowLogoutConfirm(false)}
            bodyText={t("logoutConfirmMessage")}
            confirmButtonText={t("confirmLogout")}
            discardButtonText={t("cancel")}
            handleConfirm={handleConfirmLogout}
            handleDiscard={() => setShowLogoutConfirm(false)}
          />
          <UserProfileModal
            isOpen={showProfileModal}
            onClose={() => setShowProfileModal(false)}
            onLogout={() => { setShowProfileModal(false); handleLogout() }}
            onSave={handleSaveProfile}
            userData={extractUserProfileData(profileApiData, firstName)}
            schema={PROFILE_FORM_SCHEMA}
            options={{ languages: languageList }}
            modalConfig={PROFILE_MODAL_CONFIG}
          />
        </>
      )}

      {/* ===== MAIN CHAT CONTENT ===== */}
      <div style={hasActiveFlexLayout ? { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" } : undefined}>
        {/* Mobile hamburger to open sidebar */}
        {showHistorySidebar && isMobile && (
          <button
            className="chat-sidebar-toggle"
            onClick={() => setIsSidebarOpen(prev => !prev)}
            aria-label="Toggle chat history"
          >
            ☰
          </button>
        )}
        {!showHistorySidebar && !isPopupMode && (
          <div className={`div27`}>
            <div className={isMobile ? "div30_a" : "div30"}>
              <MainHeader
                isMobileFirst={isMobile}
                showTheDots={false}
                displayNewSessionButton={!isPopupMode && !([sessionFlowName.ShikshaSamvad, sessionFlowName.DelhiShikshaSamvad, sessionFlowName.OdishaYouth, sessionFlowName.OdishaYouthAI, sessionFlowName.TelanganaPTMPilot].includes(storageFlow))}
              />
            </div>
          </div>
        )}
      {!isPopupMode && (isInitialising || isLoading || (!introMessageData && !introMessage) || (accessToken && !isTokenValidated)) && (
        <div className={isPopupMode ? undefined : "loader-load-spinner"} style={isPopupMode ? { display: "flex", justifyContent: "center", alignItems: "center", width: "100%", flex: 1 } : undefined}>
          <div className="div67">
            <BiLoader className="loader-rotate-loader loader-icon" />
          </div>
        </div>
      )}
      <div className={`${accessToken ? "div72" : ""}`} style={hasActiveFlexLayout ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : undefined}>
        <HiddenRecorder />
        <div className={`${accessToken ? "div33-a" : "div33"} div9`} style={hasActiveFlexLayout ? { flex: 1, overflowY: "auto", minHeight: 0, paddingTop: 0, paddingBottom: 0 } : undefined}>
          {!showHomepage && (
            <ul className="div34">
              {filteredChatHistory &&
                filteredChatHistory?.filter(chat => !String(chat.updated_at).startsWith("intro_msg_id"))?.map((chat, i) => (
                  <li key={i} className={`div34 div35 label1`}>
                    <div className={`div36 ${chat?.source === "user" && "div37"}`}>
                      <ChatMessage
                        botNameToDisplay={botNameToDisplay}
                        userType={chat?.source}
                        message={`${chat?.msg}`}
                        name={t("userName")}
                        recording={chat?.recording}
                        hasAppendix={chat?.recording}
                        appendixURL={chat?.appendixURL}
                        isTalking={chat.source === "bot" && !isStreamingComplete && i === filteredChatHistory.filter(c => !String(c.updated_at).startsWith("intro_msg_id")).length - 1}
                        handleOnStopSpeaking={() => handleOnStopSpeaking()}
                        handleOnSpeaking={() => {
                          handleOnSpeaking(chat?.msg, chat?.updated_at)
                        }}
                        isAnyPlaying={!!hasOverRideId || isTalking}
                        isPlaying={hasOverRideId === chat?.updated_at}
                        isStreamingComplete={isStreamingComplete}
                        setNotMute={setIsMute}
                        setSpeakerEnabled={setSpeakerEnabled}
                        chatId={chat?.updated_at}
                      />
                    </div>
                    {chat?.extra_content?.download && (chat.extra_content.download.pdf_url || chat.extra_content.download.docx_url) ? (
                      <div style={{ marginTop: "6px", marginLeft: "44px" }}>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {chat.extra_content.download.pdf_url && (
                            <button
                              onClick={() => {
                                setDownloadFileErrors((prev) => ({ ...prev, [chat.updated_at]: false }))
                                if (isOffline || !navigator.onLine) {
                                  showOfflineNotification()
                                  return
                                }
                                downloadFileFromUrl(
                                  chat.extra_content.download.pdf_url,
                                  chat.extra_content.download.file_name ? `${chat.extra_content.download.file_name}.pdf` : null,
                                  () => {
                                    if (!isOffline && navigator.onLine) {
                                      setDownloadFileErrors((prev) => ({ ...prev, [chat.updated_at]: true }))
                                    }
                                  }
                                )
                              }}
                              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "14px 20px", background: "#F1F5F9", border: "none", borderRadius: "10px", cursor: "pointer", boxShadow: "0 2px 5px rgba(0,0,0,0.5)", minWidth: "80px" }}
                            >
                              <FiDownload style={{ fontSize: "22px", color: "#2563EB" }} />
                              <span style={{ fontSize: "13px", fontWeight: 600, color: "#3b3939" }}>PDF</span>
                            </button>
                          )}
                          {chat.extra_content.download.docx_url && (
                            <button
                              onClick={() => {
                                setDownloadFileErrors((prev) => ({ ...prev, [chat.updated_at]: false }))
                                if (isOffline || !navigator.onLine) {
                                  showOfflineNotification()
                                  return
                                }
                                downloadFileFromUrl(
                                  chat.extra_content.download.docx_url,
                                  chat.extra_content.download.file_name ? `${chat.extra_content.download.file_name}.docx` : null,
                                  () => {
                                    if (!isOffline && navigator.onLine) {
                                      setDownloadFileErrors((prev) => ({ ...prev, [chat.updated_at]: true }))
                                    }
                                  }
                                )
                              }}
                              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "14px 20px", background: "#F1F5F9", border: "none", borderRadius: "10px", cursor: "pointer", boxShadow: "0 2px 5px rgba(0,0,0,0.5)", minWidth: "80px" }}
                            >
                              <FiDownload style={{ fontSize: "22px", color: "#2563EB" }} />
                              <span style={{ fontSize: "13px", fontWeight: 600, color: "#3b3939" }}>DOCX</span>
                            </button>
                          )}
                        </div>
                        {downloadFileErrors[chat.updated_at] && !isOffline && navigator.onLine && (
                          <p style={{ fontSize: "13px", color: "#dc2626", marginTop: "6px" }}>{t("downloadFileError")}</p>
                        )}
                      </div>
                    ) : null}
                    {chat?.source === CHAT_SOURCE.BOT && isStreamingComplete && (
                      <MessageActionBar
                        message={chat.msg || ""}
                        companyChatId={chat.updated_at}
                        sessionId={sessionId}
                        sources={chat?.extra_content?.sources || []}
                        isStreaming={!isStreamingComplete && i === filteredChatHistory.filter(c => !String(c.updated_at).startsWith("intro_msg_id")).length - 1}
                        isMobile={isMobile}
                        accessToken={accessToken}
                        activeSourcesChatId={activeSourcesChatId}
                        thumbs_up={chat?.thumbs_up}
                        thumbs_down={chat?.thumbs_down}
                        onToggleSources={(sourcesList) => {
                          if (activeSourcesChatId === chat.updated_at) {
                            setActiveSourcesChatId(null)
                            setActiveSources([])
                          } else {
                            setActiveSourcesChatId(chat.updated_at)
                            setActiveSources(sourcesList)
                          }
                        }}
                      />
                    )}
                  </li>
                ))}
            </ul>
          )}
          {!showHomepage && (() => {
            const filteredHistory = filteredChatHistory?.filter(chat => !String(chat.updated_at).startsWith("intro_msg_id")) ?? []
            const lastChat = filteredHistory[filteredHistory.length - 1]
            return lastChat?.source === "user" ? (
              <div className="replying-indicator" role="status" aria-live="polite">
                <span className="replying-text">{t("replyMsg")}</span>
              </div>
            ) : null
          })()}
          {showHomepage && (
            <>
              {storageFlow &&
                (() => {
                  const prefixMap = {
                    [sessionFlowName.ListeningActivity]: "la_",
                    [sessionFlowName.ParentPerceptionSurvey]: "pppi_",
                    [sessionFlowName.ShikshaSamvad]: "shiksha_samvad_",
                    [sessionFlowName.DelhiShikshaSamvad]: "shiksha_samvad_",
                    [sessionFlowName.StudyTeacherInterview]: "shiksha_samvad_",
                    [sessionFlowName.OdishaYouth]: "shiksha_samvad_",
                    [sessionFlowName.OdishaYouthAI]: "shiksha_samvad_",
                    [sessionFlowName.TelanganaPTMPilot]: "shiksha_samvad_",
                    [sessionFlowName.StakeholderFGD]: "shiksha_samvad_",
                    [sessionFlowName.BiharStudentFGD]: "shiksha_samvad_",
                    [sessionFlowName.CommunityFGD]: "shiksha_samvad_",
                    [sessionFlowName.XylemX_entrepreneurship_development]: "shiksha_samvad_",
                  }

                  const prefix = prefixMap[storageFlow] || ""
                  return (
                    <>
                      <div className="div10">
                        <h3 className="h3-1">
                          {t(`${prefix}homepageHeading`)}
                        </h3>
                        <p style={{ textAlign: "center", lineHeight: "1.8" }}>
                          {t(`${prefix}homepageList`)}
                          <br />
                          {isPopupMode || storageFlow === env.PROFILE_FLOW_NAME()
                            ? t("profileHomepageList1")
                            : t(`${prefix}homepageList1`)}
                          <br />
                          {isPopupMode || storageFlow === env.PROFILE_FLOW_NAME()
                            ? t("profileHomepageList2")
                            : t(`${prefix}homepageList2`)}
                        </p>
                      </div>
                    </>
                  )
                })()}

              {(() => {
                const firstBotQuestion = filteredChatHistory?.find(
                  c => c?.source === "bot" && !String(c.updated_at).startsWith("intro_msg_id") && c?.msg !== introMessage
                )
                if (!firstBotQuestion) return null
                return (
                  <div className="div26">
                    <div className="div36 div12">
                      <ChatMessage
                        botNameToDisplay={botNameToDisplay}
                        userType={firstBotQuestion.source}
                        message={`${firstBotQuestion.msg}`}
                        name={t("userName")}
                        recording={firstBotQuestion.recording}
                        hasAppendix={firstBotQuestion.recording}
                        appendixURL={firstBotQuestion.appendixURL}
                        isTalking={false}
                        handleOnStopSpeaking={() => handleOnStopSpeaking()}
                        handleOnSpeaking={() => {
                          handleOnSpeaking(firstBotQuestion.msg, firstBotQuestion.updated_at)
                        }}
                        isAnyPlaying={!!hasOverRideId || isTalking}
                        isPlaying={hasOverRideId === firstBotQuestion.updated_at}
                        isStreamingComplete={isStreamingComplete}
                        setNotMute={setIsMute}
                        setSpeakerEnabled={setSpeakerEnabled}
                        chatId={firstBotQuestion.updated_at}
                      />
                    </div>
                  </div>
                )
              })()}
            </>
          )}
          <div id="last-chat-boundary" className="div38" />
        </div>
        <Notification />

        {!isLoading && (llmError === "" || !llmError) && (isPopupMode || (Array.isArray(filteredChatHistory) && filteredChatHistory.some(item => item && Object.keys(item).length > 0))) && (
          <form
            className="form-1 flex flex-col"
            style={hasActiveFlexLayout ? { position: "relative", bottom: "auto", left: "auto", width: "100%", flexShrink: 0, zIndex: "auto" } : undefined}
            onSubmit={event => {
              if (event) event.preventDefault()
              if (checkIsOffline()) return
              if (!hasStartedListening && !isFetchingData) {
                handleSendMessage(event)
              }
            }}
            autoComplete="off"
          >
            {/* Quick reply chips — above the input row, below the chat messages.
                Two cases:
                  1. WS connected + streaming done → show chips from last bot msg that has chips
                  2. WS disconnected (history load/refresh) → show chips only if the very last
                     message in history IS a bot message with chips (i.e. bot was waiting for reply) */}
            {(() => {
              let lastBotMsg
              const history = filteredChatHistory ?? []

              if (isSocketConnected) {
                // Live session: show chips once streaming has finished
                if (!isStreamingComplete) return null
                lastBotMsg = [...history].reverse().find(
                  chat => chat.source === CHAT_SOURCE.BOT &&
                    Array.isArray(chat.extra_content?.quick_reply_chips) &&
                    chat.extra_content.quick_reply_chips.length > 0
                )
              } else {
                // History load / WS not yet connected:
                // Only show chips if the last real message in history is a bot msg with chips
                const filtered = history.filter(c => c.updated_at !== CHAT_SPECIAL_IDS.INTRO_MSG)
                const lastMsg = filtered[filtered.length - 1]
                if (
                  lastMsg?.source === CHAT_SOURCE.BOT &&
                  Array.isArray(lastMsg?.extra_content?.quick_reply_chips) &&
                  lastMsg.extra_content.quick_reply_chips.length > 0
                ) {
                  lastBotMsg = lastMsg
                }
              }

              const chips = lastBotMsg?.extra_content?.quick_reply_chips ?? []
              if (!chips.length || quickReplySentForMsgId === lastBotMsg?.updated_at) return null
              return (
                <div className="flex flex-wrap gap-2 px-6 pb-2 pt-2 border-b border-slate-200">
                  {chips.map((chip, idx) => (
                    <Chip
                      key={idx}
                      label={chip}
                      size="sm"
                      disabled={hasStartedRecording || isFetchingData || (isSimpleBot === false && strandStep >= stateMachineLength)}
                      onClick={async () => {
                        if (checkIsOffline()) return
                        const msgId = lastBotMsg?.updated_at ?? "default_quick_reply"
                        if (quickReplyLockRef.current.has(msgId)) return
                        quickReplyLockRef.current.add(msgId)
                        try {
                          const sent = await handleSendMessage(null, chip)
                          if (sent) {
                            setQuickReplySentForMsgId(lastBotMsg?.updated_at)
                          } else {
                            quickReplyLockRef.current.delete(msgId)
                          }
                        } catch (err) {
                          quickReplyLockRef.current.delete(msgId)
                          throw err
                        }
                      }}
                    />
                  ))}
                </div>
              )
            })()}
            {/* Input row: mic + timer + textarea + send */}
            <div className="div39 sm:p-[10px_35px] p-[10px_25px]">
            <div className={`audio-recorder ${isFetchingData ? "button-container" : ""}`}>
              <button
                type="button"
                onClick={() => {
                  if (!hasStartedRecording && checkIsOffline()) return
                  if (hasStartedRecording) {
                    stopRecording()
                  } else {
                    startRecording()
                  }
                }}
                disabled={isFetchingData}
                className={`button-7 sm:mr-[1.3rem] mr-[0.8rem] ${hasStartedRecording ? "button-8" : "button-9"}`}
              >
                {hasStartedRecording ? <FaRegStopCircle /> : <FaMicrophone />}
              </button>
            </div>
            {hasStartedRecording && (
              <div className="flex items-center space-x-1 text-red-600 text-sm font-medium pointer-events-none sm:mr-[0.5rem] mr-[0.3rem]">
                <FaCircle className="text-red-500 animate-pulse text-xs" />
                <span>{formatTime(seconds)}</span>
              </div>
            )}
            <div className="textarea-wrapper relative">
              <textarea
                id="textBoxID"
                className={`input-2 input-1 ${placeholderIsMultiLine ? "input-long-placeholder" : ""} ${isFetchingData ? "py-0" : ""}`}
                style={{ alignContent: placeholderIsMultiLine ? "normal" : "center", ...(placeholderIsMultiLine && placeholderHeight ? { "--placeholder-min-height": `${placeholderHeight}px` } : {}) }}
                onChange={handleOnInputText}
                placeholder={hasStartedRecording ? t("placeholder1") : isFetchingData ? t("placeholder2") : t("placeholder3")}
                name="message-box"
                value={textMessage}
                autoFocus={false}
                disabled={hasStartedRecording || isFetchingData || (isSimpleBot === false && strandStep >= stateMachineLength)}
                ref={textAreaCallbackRef}
                onInput={e => {
                  e.target.style.height = "auto"
                  const maxHeight = 150
                  if (e.target.scrollHeight > maxHeight) {
                    e.target.style.height = `${maxHeight}px`
                    e.target.style.overflowY = "scroll"
                  } else {
                    e.target.style.height = `${e.target.scrollHeight}px`
                    e.target.style.overflowY = "hidden"
                  }
                }}
                onFocus={() => {
                  setTimeout(() => {
                    handleScrollToView()
                    if (textAreaRef.current) {
                      textAreaRef.current.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      })
                    }
                  }, 300)
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (e.shiftKey) {
                      e.preventDefault()
                      if (checkIsOffline()) return
                      e.target.form.requestSubmit()
                      setTimeout(() => {
                        e.target.value = ""
                      }, 0)
                    }
                  }
                }}
              />
            </div>
            {isTyping && !hasStartedListening && !isFetchingData && (
              <div className="button-container">
                <button
                  type={isOffline ? "button" : "submit"}
                  disabled={hasStartedRecording || isFetchingData}
                  onClick={e => {
                    if (checkIsOffline()) {
                      e.preventDefault()
                      e.stopPropagation()
                    }
                  }}
                  className={`button-6 sm:ml-[1.3rem] ml-[0.8rem] ${isOffline ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <MdSend />
                </button>
              </div>
            )}
            </div>
          </form>
        )}
      </div>
      </div>

      <SourcesPanel
        isOpen={!!activeSourcesChatId}
        sources={activeSources}
        isMobile={isMobile}
        onClose={() => {
          setActiveSourcesChatId(null)
          setActiveSources([])
        }}
      />
    </div>
    </>
  )
}

export default DynamicVoiceChat

function ChatMessage({ userType, message, name, recording, handleOnSpeaking, handleOnStopSpeaking, isPlaying, botNameToDisplay, isStreamingComplete, setNotMute, setSpeakerEnabled, chat, staticMessage, chatId }) {
  let sanitizedContent = DOMPurify.sanitize(message)
  return (
    <div className="div41">
      {userType === "bot" && (
        <div className="div42">
          <div className={`${userType === "bot" ? "div43" : "div44"} div45`}>
            <MdAccountCircle />
          </div>
          <div className="div46">
            {userType === "bot" && isPlaying && (
              <button className={`button-10 button-3`} onClick={() => { setSpeakerEnabled?.(false); handleOnStopSpeaking() }} disabled={!isStreamingComplete}>
                <HiMiniSpeakerWave />
              </button>
            )}

            {userType === "bot" && !isPlaying && (
              <button
                className={`button-11 button-3`}
                onClick={() => {
                  setSpeakerEnabled?.(true)
                  setNotMute(false)
                  handleOnSpeaking(message, chat?.updated_at, staticMessage, true)
                }}
                disabled={!isStreamingComplete}
              >
                <HiMiniSpeakerXMark />
              </button>
            )}
          </div>
        </div>
      )}
      <div className={`${userType === "user" ? "div47" : "div48"}`}>
        <div className={`div36 ${userType === "user" && "div37"}`}>
          {userType === "user" && (
            <div className={`div49`}>
              <MdAccountCircle />
            </div>
          )}
          {userType === "bot" ? botNameToDisplay : name}
        </div>
        {!!message && !!recording && (
          <div className={` ${userType === "bot" ? "div53" : "div54"} div50`}>
            <WaveSurferPlayer url={recording?.result} {...default_wave_surfer_config} />
          </div>
        )}
        <div className={` ${userType === CHAT_SOURCE.BOT ? "div53" : "div54"} div52 custom-voice-chat-chats`} id={chatId}>
          {userType === CHAT_SOURCE.USER ? (
            <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message}</span>
          ) : (
            <ReactMarkdown children={sanitizedContent} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="prose max-w-none" />
          )}
        </div>
      </div>
    </div>
  )
}