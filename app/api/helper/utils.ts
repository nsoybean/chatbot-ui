import { HumanMessage, AIMessage } from 'langchain/dist/schema'

export enum ChatBotRole {
  Human = 'human',
  AI = 'ai'
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
