import React, { useState, useEffect, useRef } from "react"
import { RxCross2 } from "react-icons/rx"
import { FiLogOut } from "react-icons/fi"
import { useTranslation } from "react-i18next"
import FormData from "components/Form/FormData"

/** Purple avatar circle showing the first letter of the user's name */
function AvatarInitial({ name = "", size = 52 }) {
  const initial = ((name || "U")[0] || "U").toUpperCase()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#572e91",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  )
}

/**
 * Config-driven user profile modal using reusable FormData component.
 *
 * Props:
 *   isOpen      – boolean
 *   onClose     – () => void
 *   onLogout    – () => void
 *   onSave      – (formValues: object) => void
 *   userData    – { firstName, designation, companyName, userState, district, preferredLanguage, ... }
 *   schema      – PROFILE_FORM_SCHEMA object
 *   options     – { languages: [{ label, value }], ... }
 *   modalConfig – PROFILE_MODAL_CONFIG object (optional)
 */
function UserProfileModal({
  isOpen,
  onClose,
  onLogout,
  onSave,
  userData = {},
  schema = { fields: [] },
  options = {},
  modalConfig = {},
}) {
  const { t } = useTranslation()
  const [formValues, setFormValues] = useState({})

  const formFields = schema.fields || []

  const wasModalOpenRef = useRef(false)
  const previousUserDataKeyRef = useRef("")

  // Serialize active profile values to avoid resetting on reference-only changes while editing
  const serializedProfileDataKey = formFields
    .flatMap(field => (field.type === "split" ? field.fields || [] : [field]))
    .map(subField => `${subField.id}:${userData[subField.id] ?? ""}`)
    .join("|")

  useEffect(() => {
    if (!isOpen) {
      wasModalOpenRef.current = false
      return
    }

    const isModalJustOpened = !wasModalOpenRef.current
    const hasProfileDataChanged = previousUserDataKeyRef.current !== serializedProfileDataKey

    if (isModalJustOpened || hasProfileDataChanged) {
      const initialFormValues = {}
      formFields.forEach(field => {
        if (field.type === "split") {
          field.fields?.forEach(subField => { initialFormValues[subField.id] = userData[subField.id] ?? "" })
        } else {
          initialFormValues[field.id] = userData[field.id] ?? ""
        }
      })
      setFormValues(initialFormValues)
      wasModalOpenRef.current = true
      previousUserDataKeyRef.current = serializedProfileDataKey
    }
  }, [isOpen, serializedProfileDataKey])

  if (!isOpen) return null

  const handleChange = (fieldId, fieldValue) => setFormValues(prevValues => ({ ...prevValues, [fieldId]: fieldValue }))

  const inputStyleClasses =
    "w-full px-3.5 sm:px-4 py-2 sm:py-2.5 bg-[#f7f5f5] rounded-lg sm:rounded-xl text-xs sm:text-sm text-gray-700 border border-transparent focus:outline-none focus:ring-2 focus:ring-purple-300 transition-all"

  const labelStyleClasses = "block text-xs font-semibold text-[#572e91] mb-1"

  const isSubmitDisabled = formFields.some(field => {
    if (field.type === "split") {
      const isParentRequired = Boolean(field.required)
      const subFields = field.fields || []
      return subFields.some(subField => {
        const isRequiredField = isParentRequired || Boolean(subField.required)
        if (isRequiredField) {
          const val = formValues[subField.id]
          return !val?.trim()
        }
        return false
      })
    } else {
      if (field.required) {
        const val = formValues[field.id]
        return !val?.trim()
      }
      return false
    }
  })

  function showRequired(isRequired) {
    if (isRequired) return <span className="text-red-500">*</span>
    return null
  }

  function renderField(field) {
    if (field.type === "split") {
      return (
        <div key={field.id} className="mb-3 sm:mb-4">
          <div className="mb-1">
            <b className={labelStyleClasses}>
              {t(field.labelName)}
              {showRequired(field.required)}
            </b>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {field.fields?.map(subField => {
              const isRequiredSubfield = Boolean(field.required || subField.required)
              return (
              <div key={subField.id} className="w-full">
                <FormData
                  layOut={subField.layOut || 1}
                  id={subField.id}
                  isimportant={!field.required && subField.required ? "true" : "false"}
                  isRequired={isRequiredSubfield}
                  inputType={subField.inputType || "text"}
                  inputName={subField.inputName || subField.id}
                  inputValue={formValues[subField.id] || ""}
                  inputOnChange={event => handleChange(subField.id, event.target.value)}
                  placeholder={t(subField.placeholder)}
                  inputClass={inputStyleClasses}
                />
              </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div key={field.id} className="mb-3 sm:mb-4">
        <FormData
          layOut={1}
          id={field.id}
          labelName={t(field.labelName)}
          labelClass={labelStyleClasses}
          isimportant={field.required ? "true" : "false"}
          isRequired={field.required}
          inputType={field.inputType || "text"}
          inputName={field.inputName || field.id}
          inputValue={formValues[field.id] || ""}
          inputOnChange={event => handleChange(field.id, event.target.value)}
          placeholder={t(field.placeholder)}
          inputClass={inputStyleClasses}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-3 sm:p-4 backdrop-blur-sm">
      <div
        className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden max-h-[92vh] sm:max-h-[88vh]"
        style={{ maxWidth: modalConfig.maxWidth || "480px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-[#faf6fb] border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 mr-2">
            <AvatarInitial name={userData.name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-800 text-sm sm:text-base leading-snug truncate">
                {userData.name || t("user")}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 truncate">
                {userData.role || " "}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-200/50 flex-shrink-0"
            aria-label="Close"
          >
            <RxCross2 size={18} />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1">
          {formFields.map(field => renderField(field))}
          {isSubmitDisabled && (
            <div className="mt-2 sm:mt-3 flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-4 py-2.5 sm:py-3 bg-[#eeecff] rounded-2xl">
              <img
                src="/assets/info_badge.png"
                alt="Info"
                className="w-5 h-5 sm:w-6 sm:h-6 object-contain flex-shrink-0"
              />
              <span className="text-xs sm:text-sm font-medium text-[#221f25]">
                {t("pleaseFillRequiredFields")}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 flex items-center justify-between gap-2 flex-shrink-0 bg-white">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-500 hover:text-[#D11F44] hover:bg-[#D11F4433] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <FiLogOut size={16} />
            <span>{t("logout")}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              onClick={() => onSave(formValues)}
              disabled={isSubmitDisabled}
              className="px-4 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-[#572e91] rounded-lg hover:bg-[#4a2780] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#572e91]"
            >
              {t("save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { useProfileModalStore, setShowProfileModal } from "utils/profileModal"
export default UserProfileModal
