import { API_ENDPOINTS } from "../constants/urls"
import { clearFromStorage } from "../services/storage_service"
import { getFlowLanguagesApi } from "../api/endpoints/flow"
import { languageList, languageValueMap } from "../pages/ShikshalokamVoiceChat/enum"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useSiteDataSessionStore } from "store"
import ROUTES from "../url"
import { env } from "utils/env"
import { validateSession } from "../utils/session"

const LanguageSelectionGrid = () => {
  const navigate = useNavigate()

  const setChatLanguage = useSiteDataSessionStore(state => state.setChatLanguage)
  const setHasSelectedLanguage = useSiteDataSessionStore(state => state.setHasSelectedLanguage)

  const flowName = env.FLOW_NAME()

  const {
    data: flowLanguages,
    isError: isFlowLanguagesError,
    error: flowLanguagesError,
    isLoading: isFlowLanguagesLoading,
  } = useQuery({
    queryKey: [API_ENDPOINTS.FLOW_LANGUAGES, flowName],
    queryFn: () => getFlowLanguagesApi(flowName),
    retry: false,
    enabled: !!flowName,
  })

  useEffect(() => {
    if (!isFlowLanguagesError) return

    if (flowLanguagesError?.response?.status === 404) {
      console.error("Flow not found or inactivate, navigating to home page")
      clearFromStorage()
      navigate(ROUTES.SHIKSHALOKAM_HOME_PAGE, { replace: true })
    }
  }, [flowLanguagesError, isFlowLanguagesError])

  const handleLanguageClick = async langValue => {
    try {
      await validateSession()
    } catch (error) {
      console.error("[LanguageSelectionGrid] Session validation failed:", error)
      return
    }
    setChatLanguage(langValue)
    setHasSelectedLanguage(true)
  }

  return (
    <>
      <div className="text-center text-lg md:text-2xl sm:text-md mt-0 sm:mt-[100px] text-slate-700">
        <b>Welcome</b>
      </div>
      <p className="sm:text-xl text-md font-semibold text-center">Select your preferred language</p>
      <div className="mt-4 mb-10 grid grid-cols-2 gap-3 md:gap-6 lg:px-[80px] md:px-[20px] sm:px-[20px] px-[10px]">
        {isFlowLanguagesLoading &&
          Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="div14-lang animate-skeleton m-0 h-[100px]"></div>
          ))}
        {!isFlowLanguagesLoading && flowLanguages &&
          flowLanguages.languages.map((lang, index, arr) => {
            const isLastOdd = arr.length % 2 !== 0 && index === arr.length - 1
            return (
              <div
                key={lang}
                className={`div14-lang m-0 h-[100px] flex items-center justify-center${isLastOdd ? " col-span-2 w-1/2 mx-auto" : ""}`}
                onClick={() => handleLanguageClick(lang)}
              >
                <button className="w-full text-center">{languageValueMap[lang]}</button>
              </div>
            )
          })}
        {!isFlowLanguagesLoading && !flowLanguages &&
          languageList
            .map((lang, index, arr) => {
              const isLastOdd = arr.length % 2 !== 0 && index === arr.length - 1
              return (
                <div
                  key={lang.value}
                  className={`div14-lang m-0 h-[100px] flex items-center justify-center${isLastOdd ? " col-span-2 w-1/2 mx-auto" : ""}`}
                  onClick={() => handleLanguageClick(lang.value)}
                >
                  <button className="w-full text-center">{lang.label}</button>
                </div>
              )
            })}
      </div>
    </>
  )
}

export default LanguageSelectionGrid
