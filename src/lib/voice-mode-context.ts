import { createContext, useContext } from 'react'

export const VoiceModeContext = createContext<{
  isVoiceMode: boolean
  setIsVoiceMode: (v: boolean) => void
}>({ isVoiceMode: false, setIsVoiceMode: () => {} })

export const useVoiceMode = () => useContext(VoiceModeContext)
