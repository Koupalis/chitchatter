import { useContext, useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'

import { rtcConfig } from 'config/rtcConfig'
import { trackerUrls } from 'config/trackerUrls'
import { ShellContext } from 'contexts/ShellContext'
import { SettingsContext } from 'contexts/SettingsContext'
import { usePeerRoom, usePeerRoomAction } from 'hooks/usePeerRoom'
import { PeerActions } from 'models/network'
import { UnsentMessage, ReceivedMessage } from 'models/chat'
import { MessageForm } from 'components/MessageForm'
import { ChatTranscript } from 'components/ChatTranscript'

export interface RoomProps {
  appId?: string
  getUuid?: typeof uuid
  roomId: string
  userId: string
}

export function Room({
  appId = `${encodeURI(window.location.origin)}_${process.env.REACT_APP_NAME}`,
  getUuid = uuid,
  roomId,
  userId,
}: RoomProps) {
  const [numberOfPeers, setNumberOfPeers] = useState(1) // Includes this peer
  const shellContext = useContext(ShellContext)
  const settingsContext = useContext(SettingsContext)
  const [isMessageSending, setIsMessageSending] = useState(false)
  const [messageLog, setMessageLog] = useState<
    Array<ReceivedMessage | UnsentMessage>
  >([])
  const [audioContext] = useState(() => new AudioContext())
  const audioBufferContainer = useRef<AudioBuffer | null>(null)

  const peerRoom = usePeerRoom(
    {
      appId,
      trackerUrls,
      rtcConfig,
    },
    roomId
  )

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch(
          process.env.PUBLIC_URL + '/sounds/new-message.aac'
        )
        const arrayBuffer = await response.arrayBuffer()
        audioBufferContainer.current = await audioContext.decodeAudioData(
          arrayBuffer
        )
      } catch (e) {
        console.error(e)
      }
    })()
  }, [audioBufferContainer, audioContext])

  useEffect(() => {
    shellContext.setDoShowPeers(true)

    peerRoom.onPeerJoin(() => {
      shellContext.showAlert(`Someone has joined the room`, {
        severity: 'success',
      })

      const newNumberOfPeers = numberOfPeers + 1
      setNumberOfPeers(newNumberOfPeers)
      shellContext.setNumberOfPeers(newNumberOfPeers)
    })

    peerRoom.onPeerLeave(() => {
      shellContext.showAlert(`Someone has left the room`, {
        severity: 'warning',
      })

      const newNumberOfPeers = numberOfPeers - 1
      setNumberOfPeers(newNumberOfPeers)
      shellContext.setNumberOfPeers(newNumberOfPeers)
    })

    return () => {
      shellContext.setDoShowPeers(false)
    }
  }, [numberOfPeers, peerRoom, shellContext])

  const [sendMessage, receiveMessage] = usePeerRoomAction<UnsentMessage>(
    peerRoom,
    PeerActions.MESSAGE
  )

  const performMessageSend = async (message: string) => {
    if (isMessageSending) return

    const unsentMessage: UnsentMessage = {
      authorId: userId,
      text: message,
      timeSent: Date.now(),
      id: getUuid(),
    }

    setIsMessageSending(true)
    setMessageLog([...messageLog, unsentMessage])
    await sendMessage(unsentMessage)

    setMessageLog([
      ...messageLog,
      { ...unsentMessage, timeReceived: Date.now() },
    ])
    setIsMessageSending(false)
  }

  receiveMessage(message => {
    const userSettings = settingsContext.getUserSettings()
    !shellContext.tabHasFocus &&
      userSettings.playSoundOnNewMessage &&
      playNewMessageSound()
    setMessageLog([...messageLog, { ...message, timeReceived: Date.now() }])
  })

  const playNewMessageSound = () => {
    if (!audioBufferContainer.current) {
      console.error('Audio buffer not available')
      return
    }
    const audioSource = audioContext.createBufferSource()
    audioSource.buffer = audioBufferContainer.current
    audioSource.connect(audioContext.destination)
    audioSource.start()
  }

  const handleMessageSubmit = async (message: string) => {
    await performMessageSend(message)
  }

  return (
    <Box
      className="Room"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ChatTranscript
        messageLog={messageLog}
        userId={userId}
        className="grow overflow-auto px-4"
      />
      <Divider />
      <MessageForm
        onMessageSubmit={handleMessageSubmit}
        isMessageSending={isMessageSending}
      />
    </Box>
  )
}
