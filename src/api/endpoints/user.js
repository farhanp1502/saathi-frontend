import { API_ENDPOINTS } from "constants/urls"
import { apiClient } from "../client"
import env from "utils/env"
import Swal from "sweetalert2"
import i18n from "i18next"
import ROUTES from "../../url"
import { clearFromStorage } from "../../services/storage_service"
import useUserDataLocalStore from "../../store/slices/userData/userDataLocal"
import { setShowProfileModal } from "utils/profileModal"

export const getProfileApi = async (profileId, accessToken) => {
  try {
    const response = await apiClient.get(API_ENDPOINTS.GET_PROFILE, {
      params: {
        profile_id: profileId,
      },
      headers: {
        "Content-Type": "application/json",
        "x-auth-token": accessToken,
      },
    })

    return response.data
  } catch (error) {
    return error?.response?.data
  }
}

export const acceptTncApi = async (profileId, accessToken) => {
  try {
    const response = await apiClient.patch(
      API_ENDPOINTS.ACCEPT_TNC,
      {
        profile_id: profileId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": accessToken,
        },
      }
    )

    return response.data
  } catch (error) {
    return error?.response?.data
  }
}

/**
 * Read Elevate profile using access token
 * @param {string} accessToken - The access token for authentication
 * @returns {Promise<Object>} The Elevate profile data
 */
let _sessionInvalidPopupShown = false

export const readElevateProfileApi = async (accessToken, { silent = false } = {}) => {
  try {
    const authUrl = env.AUTH_ROUTE()
    const response = await apiClient.get(authUrl, {
      headers: {
        "Content-Type": "application/json",
        "x-auth-token": accessToken,
      },
      withCredentials: true,
    })
    return response?.data
  } catch (error) {
    console.log("[readElevateProfileApi] error status:", error?.response?.status)
    if (error?.response?.status === 401) {
      if (silent) {
        // Caller handles the 401 — just clear token and return
        useUserDataLocalStore.getState().setAccessToken(null)
        return
      }
      if (_sessionInvalidPopupShown) return
      _sessionInvalidPopupShown = true
      setShowProfileModal(false)
      await Swal.fire({
        text: i18n.t("sessionExpiredMessage"),
        confirmButtonText: i18n.t("confirmChanges"),
        allowOutsideClick: false,
        allowEscapeKey: false,
      })
      useUserDataLocalStore.getState().setAccessToken(null)
      clearFromStorage()
      window.location.href = ROUTES.SHIKSHALOKAM_HOME_PAGE
    }
    else {
      throw error
    }
  }
}

/**
 * Updates user profile details via PATCH request
 * @param {Object} data - Profile payload: { name, role, school_name, district, state }
 * @param {string} accessToken - Access token for authentication
 * @returns {Promise<Object>} Updated profile data
 */
export const updateUserProfileApi = async (data, accessToken) => {
  const response = await apiClient.patch(
    API_ENDPOINTS.UPDATE_USER_PROFILE,
    data,
    {
      headers: {
        "Content-Type": "application/json",
        "X-auth-token": accessToken,
      },
    }
  )
  return response?.data
}

