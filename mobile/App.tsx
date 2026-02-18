import React, { useCallback, useEffect, useRef, useState } from 'react'
import { NavigationContainer, DarkTheme } from '@react-navigation/native'
import { createDrawerNavigator } from '@react-navigation/drawer'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ChatScreen } from './src/screens/ChatScreen'
import { SessionDrawer } from './src/components/SessionDrawer'
import { wsManager } from './src/api/websocket'
import { dark } from './src/theme/colors'

type RootDrawerParamList = {
  Chat: { sessionId?: string }
}

const Drawer = createDrawerNavigator<RootDrawerParamList>()

const NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: dark.background,
    card: dark.surface,
    text: dark.text,
    border: dark.border,
    primary: dark.primary,
  },
}

export default function App() {
  const navigationRef = useRef<any>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>()

  // Connect WebSocket on mount
  useEffect(() => {
    wsManager.connect()
    return () => {
      wsManager.disconnect()
    }
  }, [])

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(undefined)
    navigationRef.current?.navigate('Chat', { sessionId: undefined })
    navigationRef.current?.closeDrawer?.()
  }, [])

  const handleSelectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId)
    navigationRef.current?.navigate('Chat', { sessionId })
    navigationRef.current?.closeDrawer?.()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer
          ref={navigationRef}
          theme={NavTheme}
        >
          <Drawer.Navigator
            screenOptions={{
              headerTitle: 'Wrex',
              drawerType: 'front',
              drawerStyle: { width: 300 },
            }}
            drawerContent={(props) => (
              <SessionDrawer
                {...props}
                currentSessionId={currentSessionId}
                onNewChat={handleNewChat}
                onSelectSession={handleSelectSession}
              />
            )}
          >
            <Drawer.Screen name="Chat" component={ChatScreen} initialParams={{}} />
          </Drawer.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
