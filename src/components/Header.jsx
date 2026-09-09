// components/Header.js
import { HEADER_TITLE } from "constants/common"

const Header = ({
  // userLanguage,
  languageButtonSelect,
  // onLanguageChange,
  isDesktop = false,
}) => {
  const logo = "https://static-media.gritworks.ai/fe-images/PNG/Shikshalokam/Shikshagraha/PDF Logo/English Horizontal.png"

  if (isDesktop) {
    return (
      <>
        {/* Desktop Language Selector */}
        {/* <LanguageSelector
          className="absolute top-6 right-6 hidden sm:block"
          isVisible={!!languageButtonSelect}
        /> */}

        {/* Desktop Header */}
        <div className="px-5 hidden sm:block">
          <div className="flex">
            <img src={logo} className="h-[100px] w-[200px] object-contain aspect-auto align-top object-[center_center] relative ml-0" alt="shikshalokam_logo" />
          </div>
          <div className="mt-[40px]">
            <div className="text-center sm:text-md text-xl mb-2 text-slate-700">
              <b>{HEADER_TITLE}</b>
            </div>
          </div>
          <img src="https://mohini-static.shikshalokam.org/fe-images/PNG/Shikshalokam/innovationpana-1@2x.png" width="360" height="300" className="center-img custom-login-image" alt="" />
        </div>
      </>
    )
  }

  // Mobile Header
  return (
    <>
      <div className="justify-center w-full flex sm:hidden">
        <div className="w-full">
          <div className="justify-center w-full flex sm:hidden items-center p-2">
            <img src={logo} className="h-[50px] w-[140px] object-contain" alt="shikshalokam_logo" />
            {/* <LanguageSelector
              className="w-[140px] flex justify-end p-2"
              isVisible={languageButtonSelect && ![null, ""].includes(languageButtonSelect)}
            /> */}
          </div>
        </div>
      </div>
      <div className="sm:hidden text-center sm:text-sm mb-1 text-md text-slate-700">
        <b>{HEADER_TITLE}</b>
      </div>
      <img src="https://mohini-static.shikshalokam.org/fe-images/PNG/Shikshalokam/innovationpana-1@2x.png" width="170" height="100" className="center-img custom-login-image sm:hidden" alt="" />
    </>
  )
}

export default Header
