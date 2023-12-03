'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { type Chat } from '@/lib/types'

import { MongoClient } from 'mongodb'

const database = process.env.MONGODB_DATABASE || 'test'
const chatMemoryCollection = process.env.MONGODB_CHAT_MEM_COLLECTION || 'memory'
const userChatListCollection =
  process.env.MONGODB_USER_CHAT_LIST_COLLECTION || 'userChatList'
const client = new MongoClient(process.env.MONGODB_URI || '')
const chatMemoryCol = client.db(database).collection(chatMemoryCollection)
const userChatListCol = client.db(database).collection(userChatListCollection)

export async function getChats(userId?: string | null) {
  if (!userId) {
    return []
  }

  try {
    let results: Chat[] = []
    const chats = await userChatListCol.findOne({ userId })
    if (!chats) {
      return []
    }

    for (const chat of chats.chats) {
      const chatData = await chatMemoryCol.findOne(
        {
          chatId: chat.id
        }
        // { projection: { messages: 0 } } // TODO @sb: consider excluding as large data sent over network. Currently used to show number of messages before sharing chat
      )

      if (chatData) {
        const mapped: Chat = {
          id: chatData.chatId,
          title: chatData.title,
          createdAt: chatData.createdAt,
          userId: chatData.userId,
          path: chatData.path,
          messages: chatData.messages,
          sharePath: chatData?.sharePath
        }
        results.push(mapped)
      }
    }

    return results as Chat[]
  } catch (error) {
    return []
  }
}

export async function getChat(id: string, userId: string) {
  const chat = await chatMemoryCol.findOne({
    chatId: id
  })

  if (!chat || (userId && chat.userId !== userId)) {
    return null
  }

  const remappedChat: Chat = {
    id: chat.chatId,
    title: chat.title,
    createdAt: chat.createdAt,
    userId: chat.userId,
    path: chat.path,
    messages: chat.messages,
    sharePath: chat.sharePath
  }
  return remappedChat
}

export async function removeChat({ id, path }: { id: string; path: string }) {
  const session = await auth()
  const userId = session?.user?.id

  if (!userId) {
    return {
      error: 'Unauthorized'
    }
  }

  // delete chat data
  await chatMemoryCol.deleteOne({ chatId: id, userId: userId })
  // remove chat from user's chat list
  await userChatListCol.updateOne({ userId }, { $pull: { chats: { id: id } } })

  revalidatePath('/')
  return revalidatePath(path)
}

export async function clearChats() {
  const session = await auth()
  const userId = session?.user?.id

  if (!userId) {
    return {
      error: 'Unauthorized'
    }
  }

  const chats = await userChatListCol.findOne({ userId })
  if (!chats || !chats.chats.length) {
    return redirect('/')
  }

  // delete all chat data related to user
  await chatMemoryCol.deleteMany({ userId })

  // reset chat list
  await userChatListCol.updateOne(
    { userId },
    {
      $set: { chats: [] }
    }
  )

  revalidatePath('/')
  return redirect('/')
}

export async function getSharedChat(id: string) {
  const chat = await chatMemoryCol.findOne({
    sharePath: `/share/${id}`
  })

  if (!chat || !chat.sharePath) {
    return null
  }

  return chat
}

export async function shareChat(chat: Chat) {
  const session = await auth()

  if (!session?.user?.id || session.user.id !== chat.userId) {
    return {
      error: 'Unauthorized'
    }
  }

  const userId = session?.user?.id
  const chatId = chat.id
  await chatMemoryCol.updateOne(
    { chatId: chatId, userId: userId },
    {
      $set: {
        sharePath: `/share/${chat.id}`
      }
    }
  )

  const payload = {
    ...chat,
    sharePath: `/share/${chat.id}`
  }

  return payload
}
