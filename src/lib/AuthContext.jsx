import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { PREVIEW_USER_SESSION_KEY, assertCanEnterPreview, isPreviewAdministrator, resolveEffectiveUser } from '@/lib/previewAsUserCore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [actualUser, setActualUser] = useState(null);
  const [previewUser, setPreviewUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setActualUser(currentUser);
      setPreviewUser(null);
      const previewUserId = sessionStorage.getItem(PREVIEW_USER_SESSION_KEY);
      if (previewUserId && isPreviewAdministrator(currentUser) && previewUserId !== currentUser.id) {
        try {
          const savedPreviewUser = await base44.entities.User.get(previewUserId);
          assertCanEnterPreview(currentUser, savedPreviewUser);
          setPreviewUser(savedPreviewUser);
        } catch {
          sessionStorage.removeItem(PREVIEW_USER_SESSION_KEY);
        }
      } else if (previewUserId) sessionStorage.removeItem(PREVIEW_USER_SESSION_KEY);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    sessionStorage.removeItem(PREVIEW_USER_SESSION_KEY);
    setPreviewUser(null);
    setActualUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const startPreviewAsUser = async (targetUser) => {
    assertCanEnterPreview(actualUser, targetUser);
    const verifiedTarget = await base44.entities.User.get(targetUser.id);
    assertCanEnterPreview(actualUser, verifiedTarget);
    sessionStorage.setItem(PREVIEW_USER_SESSION_KEY, verifiedTarget.id);
    setPreviewUser(verifiedTarget);
    return verifiedTarget;
  };

  const exitPreviewAsUser = () => {
    if (!isPreviewAdministrator(actualUser)) return false;
    sessionStorage.removeItem(PREVIEW_USER_SESSION_KEY);
    setPreviewUser(null);
    return true;
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  const effectiveUser = resolveEffectiveUser(actualUser, previewUser);

  return (
    <AuthContext.Provider value={{ 
      user: effectiveUser,
      actualUser,
      effectiveUser,
      isPreviewMode: Boolean(previewUser && effectiveUser?.id !== actualUser?.id),
      canPreviewAsUser: isPreviewAdministrator(actualUser),
      startPreviewAsUser,
      exitPreviewAsUser,
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
