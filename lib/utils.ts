import { clsx, type ClassValue } from 'clsx'
import { customAlphabet } from 'nanoid'
import { twMerge } from 'tailwind-merge'
import { HumanMessage, AIMessage } from 'langchain/dist/schema'
import { ChatBotRole } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7
) // 7-character random string

export async function fetcher<JSON = any>(
  input: RequestInfo,
  init?: RequestInit
): Promise<JSON> {
  const res = await fetch(input, init)

  if (!res.ok) {
    const json = await res.json()
    if (json.error) {
      const error = new Error(json.error) as Error & {
        status: number
      }
      error.status = res.status
      throw error
    } else {
      throw new Error('An unexpected error occurred')
    }
  }

  return res.json()
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 *
 * @param inputChatHistory convert array of chat history to BaseMessage[]
 * @returns
 */
export function convertToBaseMessage(
  inputChatHistory: { role: string; content: string }[]
) {
  if (inputChatHistory.length === 0) {
    return []
  }

  const baseMessages = []
  for (const message of inputChatHistory) {
    if (message.role === ChatBotRole.Human) {
      baseMessages.push(new HumanMessage({ content: message.content }))
    } else if (message.role === ChatBotRole.AI) {
      baseMessages.push(new AIMessage({ content: message.content }))
    }
  }

  return baseMessages
}
