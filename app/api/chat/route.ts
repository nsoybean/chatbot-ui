/**
 * to consider moving into standlone node server for scalability/ microservice architecture
 */
import { StreamingTextResponse } from 'ai'

import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'

import { RunnableSequence } from 'langchain/schema/runnable'
import { BytesOutputParser } from 'langchain/schema/output_parser'

import {
  AIMessagePromptTemplate,
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder
} from 'langchain/prompts'

import { ChatOpenAI } from 'langchain/chat_models/openai'
import { LLMResult } from 'langchain/dist/schema'

import { convertToBaseMessage } from '@/lib/utils'
import { ChatBotRole } from '@/lib/types'

import clientPromise from '@/lib/mongodb'

// Prompt constant
const combineDocumentsPromptTemplate = ChatPromptTemplate.fromMessages([
  AIMessagePromptTemplate.fromTemplate(
    `You are a digital marketing manager, strictly talk only about marketing content. Otherwise respond with 'I am a marketing chatbot, i do not have answer to your question.
    Use the following pieces of chat_history to answer the question at the end. If you don't know the answer, just say that you don't know, don't try to make up an answer.`
  ),
  new MessagesPlaceholder('chat_history'),
  HumanMessagePromptTemplate.fromTemplate('Question: {question}')
])

// config
const lastKChatHistory = process.env.LAST_K_CHAT_HISTORY || 5
const database = process.env.MONGODB_DATABASE || 'test'
const chatMemoryCollection = process.env.MONGODB_CHAT_MEM_COLLECTION || 'memory'
const userChatListCollection =
  process.env.MONGODB_USER_CHAT_LIST_COLLECTION || 'userChatList'

// export const runtime = 'edge'

// init model
const model = new ChatOpenAI({
  modelName: process.env.OPEN_AI_MODEL,
  openAIApiKey: process.env.OPENAI_API_KEY,
  verbose: process.env.OPENAI_VERBOSE === 'true' || false,
  streaming: true
})

// main API route
export async function POST(req: Request) {
  // db
  const client = await clientPromise
  const db = client.db(database)

  const json = await req.json()
  const { messages, id: chatId } = json

  const userId = (await auth())?.user.id
  console.log(`🚀 chatId: ${chatId}, userId: ${userId}`)

  if (!userId) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  /**
   * Chat models stream message chunks rather than bytes, so this
   * output parser handles serialization and byte-encoding.
   */
  const outputParser = new BytesOutputParser()

  // runnable chain
  const chain = RunnableSequence.from([
    {
      question: (input: { question: string }) => input.question,
      chat_history: async () => {
        const chatMemory = await db
          .collection(chatMemoryCollection)
          .find(
            {
              chatId: chatId,
              userId: userId
            },
            {
              projection: {
                messages: { $slice: -1 * Number(lastKChatHistory) } // last K chat history
              }
            }
          )
          .toArray()

        if (chatMemory.length > 0 && chatMemory[0].messages.length > 0) {
          const messages = convertToBaseMessage(chatMemory[0].messages)
          return messages
        }
        return []
      }
    },
    combineDocumentsPromptTemplate,
    model,
    outputParser
  ])

  const userQn = messages.at(-1).content
  console.log('🚀 user qn:', userQn)

  const stream = await chain.stream(
    {
      question: userQn
    },
    {
      callbacks: [
        {
          handleLLMEnd: async (output: LLMResult) => {
            try {
              const LLMOutput = output.generations[0][0].text
              // persist
              const humanMsg = { role: ChatBotRole.Human, content: userQn }
              const aiMsg = { role: ChatBotRole.AI, content: LLMOutput }

              const title = json.messages[0].content.substring(0, 100) // first 100 char as chat title
              const id = json.id ?? nanoid()
              const createdAt = Date.now()
              const path = `/chat/${id}`
              const chatId = id
              const payload = {
                title,
                userId,
                createdAt,
                path,
                chatId
              }
              console.log('🚀 aiMsg:', aiMsg.content)

              // upsert chat memory
              await db.collection(chatMemoryCollection).updateOne(
                { chatId: chatId, userId: userId },
                {
                  $setOnInsert: payload, // only on first instance
                  $push: { messages: { $each: [humanMsg, aiMsg] } } // append new user and AI msg
                },
                { upsert: true }
              )

              // upsert user's chat list
              const userChat = await db
                .collection(userChatListCollection)
                .findOne({
                  userId: userId,
                  'chats.id': chatId
                })
              if (userChat) {
                await db.collection(userChatListCollection).updateOne(
                  { userId: userId, 'chats.id': chatId },
                  {
                    $set: { 'chats.$[element].updatedAt': Date.now() }
                  },
                  {
                    arrayFilters: [{ 'element.id': chatId }]
                  }
                )
              } else {
                await db.collection(userChatListCollection).updateOne(
                  { userId: userId },
                  {
                    $set: { userId: userId },
                    $push: { chats: { id: chatId, updatedAt: Date.now() } }
                  },
                  { upsert: true }
                )
              }
            } catch (error) {
              console.log(`Server Error! Msg: ${JSON.stringify(error)}`)
            }
          }
        }
      ]
    }
  )

  return new StreamingTextResponse(stream)
}
