/**
 * to consider moving into standlone node server for scalability/ microservice architecture
 */
import { kv } from '@vercel/kv'
import { StreamingTextResponse } from 'ai'

import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'
import { MongoClient } from 'mongodb'

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

// Prompt constant
export const combineDocumentsPromptTemplate = ChatPromptTemplate.fromMessages([
  AIMessagePromptTemplate.fromTemplate(
    `You are a digital marketing manager.
    Use the following pieces of chat_history and knowledge to answer the question at the end. 
    Allow the user to ask about previous chat conversations. 
    However, if its not related to marketing topic, respond with 'I am a marketing chatbot, i do not have answer to your question. 
    If you don't know the answer, just say that you don't know, don't try to make up an answer.`
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

// init DB
const client = new MongoClient(process.env.MONGODB_URI || '')
const chatMemoryCol = client.db(database).collection(chatMemoryCollection)
const userChatListCol = client.db(database).collection(userChatListCollection)

// main API route
export async function POST(req: Request) {
  // db
  await client.connect()

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
        const chatMemory = await chatMemoryCol
          .find(
            {
              userChatId: `${userId}-${chatId}`
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
              await chatMemoryCol.updateOne(
                { userChatId: `${userId}-${chatId}` },
                {
                  $setOnInsert: payload, // only on first instance
                  $push: { messages: { $each: [humanMsg, aiMsg] } } // append new user and AI msg
                },
                { upsert: true }
              )

              // upsert user's chat list
              const userChat = await userChatListCol.findOne({
                userId: userId,
                'chats.id': chatId
              })
              if (userChat) {
                await userChatListCol.updateOne(
                  { userId: userId, 'chats.id': chatId },
                  {
                    $set: { 'chats.$[element].updatedAt': Date.now() }
                  },
                  {
                    arrayFilters: [{ 'element.id': chatId }]
                  }
                )
              } else {
                await userChatListCol.updateOne(
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
