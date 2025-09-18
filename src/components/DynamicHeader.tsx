import React, { useEffect, useMemo, useState } from "react";
import { decodeToHex } from "../lib/decode";
import { COMMON_RELAYS } from "../lib/relays";
import { pool, eventStore } from "../lib/applesauce";
import { onlyEvents } from "applesauce-relay";
import { take, takeUntil, timer } from "rxjs";
import { getInboxes, getOutboxes, getProfilePicture, mergeRelaySets } from "applesauce-core/helpers";
import { mapEventsToStore } from "applesauce-core";
import { useObservableMemo } from "applesauce-react/hooks";

interface DynamicHeaderProps {
  userHex?: string;
  userNpub?: string;
}

export default function DynamicHeader({ userHex, userNpub }: DynamicHeaderProps) {
  // Craig's profile info
  const craigEnvNpub = (import.meta as any).env?.VITE_APP_NPUB || (import.meta as any).env?.VITE_NPUB || "";
  const craigHex = useMemo(() => (craigEnvNpub ? decodeToHex(craigEnvNpub) : undefined), [craigEnvNpub]);
  const [craigRelays, setCraigRelays] = useState<string[]>(COMMON_RELAYS);

  // User profile info (when viewing someone's profile)
  const [userRelays, setUserRelays] = useState<string[]>(COMMON_RELAYS);

  // Fetch Craig's relays
  useEffect(() => {
    if (!craigHex) return;
    const sub$ = pool
      .subscription(COMMON_RELAYS, [{ authors: [craigHex], kinds: [10002], limit: 1 }])
      .pipe(onlyEvents(), take(1), takeUntil(timer(3000)))
      .subscribe({
        next: (evt) => {
          const relays = mergeRelaySets([...getInboxes(evt), ...getOutboxes(evt)]);
          if (relays.length) setCraigRelays(relays);
        },
        error: () => {},
      });
    return () => sub$.unsubscribe();
  }, [craigHex]);

  // Fetch user's relays (when viewing someone's profile)
  useEffect(() => {
    if (!userHex) return;
    const sub$ = pool
      .subscription(COMMON_RELAYS, [{ authors: [userHex], kinds: [10002], limit: 1 }])
      .pipe(onlyEvents(), take(1), takeUntil(timer(3000)))
      .subscribe({
        next: (evt) => {
          const relays = mergeRelaySets([...getInboxes(evt), ...getOutboxes(evt)]);
          if (relays.length) setUserRelays(relays);
        },
        error: () => {},
      });
    return () => sub$.unsubscribe();
  }, [userHex]);


  // State for storing profile data
  const [craigProfileData, setCraigProfileData] = useState<any>(null);
  const [userProfileData, setUserProfileData] = useState<any>(null);

  // Fetch Craig's profile directly
  useEffect(() => {
    if (!craigHex || !craigRelays.length) return;
    
    const sub$ = pool
      .subscription(craigRelays, [{ authors: [craigHex], kinds: [0], limit: 1 }])
      .pipe(onlyEvents(), take(1), takeUntil(timer(10000)))
      .subscribe({
        next: (event) => {
          setCraigProfileData(event);
        },
        error: () => {} // Silently handle errors
      });
    return () => sub$.unsubscribe();
  }, [craigHex, craigRelays.join("|")]);

  // Fetch user's profile directly
  useEffect(() => {
    if (!userHex || !userRelays.length) return;
    
    const sub$ = pool
      .subscription(userRelays, [{ authors: [userHex], kinds: [0], limit: 1 }])
      .pipe(onlyEvents(), take(1), takeUntil(timer(10000)))
      .subscribe({
        next: (event) => {
          setUserProfileData(event);
        },
        error: () => {} // Silently handle errors
      });
    return () => sub$.unsubscribe();
  }, [userHex, userRelays.join("|")]);

  const craigProfile = craigProfileData;
  const userProfile = userProfileData;

  const craigPicture = getProfilePicture(craigProfile, craigHex ? `https://robohash.org/${craigHex}.png` : undefined);
  const userPicture = getProfilePicture(userProfile, userHex ? `https://robohash.org/${userHex}.png` : undefined);

  // Extract names and descriptions with safe JSON parsing
  const parseCraigProfile = () => {
    try {
      return craigProfile?.content ? JSON.parse(craigProfile.content) : {};
    } catch (error) {
      console.error('Error parsing Craig profile:', error, craigProfile?.content);
      return {};
    }
  };

  const parseUserProfile = () => {
    try {
      return userProfile?.content ? JSON.parse(userProfile.content) : {};
    } catch (error) {
      console.error('Error parsing user profile:', error, userProfile?.content);
      return {};
    }
  };

  const craigData = parseCraigProfile();
  const userData = parseUserProfile();

  // Debug logging (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('Profile data - Craig:', craigData, 'User:', userData);
  }

  const craigName = craigData?.name || craigData?.display_name || "Craig David";
  const craigAbout = craigData?.about || "Pit your week against Craigs famous seven days";
  
  const userName = userData?.name || userData?.display_name || (userHex ? "Loading..." : "User Name");
  const userAbout = userData?.about || (userHex ? "Loading profile..." : "User Tagline from their profile.");

  const showVs = !!userHex;

  // Show loading if user profile is expected but not loaded yet
  const isUserProfileLoading = userHex && (!userProfile || !userProfile.content);

  return (
    <header className="mt-4 mb-6">
      <div className="flex items-center justify-center gap-6 md:gap-12 max-w-5xl mx-auto px-4">
        {/* Craig's side */}
        <div className="flex items-center gap-3 md:gap-4">
          {craigPicture && (
            <img
              src={craigPicture}
              alt={craigName}
              className="w-16 h-16 md:w-20 md:h-20 rounded-full shadow-lg"
            />
          )}
          <div className="text-left">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-white">
              {craigName}
            </h1>
            <p className="opacity-80 text-xs md:text-sm max-w-xs lg:max-w-sm text-gray-300">
              {craigAbout}
            </p>
          </div>
        </div>

        {/* VS indicator */}
        {showVs && (
          <div className="text-xl md:text-2xl font-bold opacity-70 text-gray-400 px-2">
            vs.
          </div>
        )}

        {/* User's side (when viewing someone's profile) */}
        {showVs && (
          <div className="flex items-center gap-3 md:gap-4">
            <div className="text-right">
              <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-white">
                {userName}
              </h2>
              <p className="opacity-80 text-xs md:text-sm max-w-xs lg:max-w-sm text-gray-300">
                {userAbout}
              </p>
            </div>
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gray-700 flex items-center justify-center shadow-lg overflow-hidden">
              {userPicture ? (
                <img
                  src={userPicture}
                  alt={userName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-400 text-sm font-medium">
                  User Avatar
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}