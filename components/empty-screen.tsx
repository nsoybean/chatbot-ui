import { UseChatHelpers } from 'ai/react'

import { Button } from '@/components/ui/button'
import { ExternalLink } from '@/components/external-link'
import { IconArrowRight } from '@/components/ui/icons'

const exampleMessages = [
  {
    heading: 'Explain technical concepts',
    message: `What is inbound and outbound marketing?`
  },
  {
    heading: 'Generate email subject',
    message:
      'Write an email subject line for an email to promote [PRODUCT/ SERVICE YOU WANT TO PROMOTE]. The target audience is [TARGET AUDIENCE]. Create 10 variations that are [MENTION TONE/STYLE]. Add keywords [MENTION KEYWORDS].'
  },
  {
    heading: 'Draft blog post',
    message: `Generate four title options for a blog post about [INSERT TOPICS HERE], use the following keywords in the title [INSERT KEYWORDS].`
  }
]

export function EmptyScreen({ setInput }: Pick<UseChatHelpers, 'setInput'>) {
  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="rounded-lg border bg-background p-8">
        <h1 className="mb-2 text-lg font-semibold">
          Welcome to Mavic.ai Chatbot!
        </h1>
        <p className="mb-2 leading-normal text-muted-foreground">
          Hi there! I'm a trained digital marketer ready to assist you. What
          questions do you have today? Whether it's about SEO, social media,
          content strategy, or anything else, I'm here to help you navigate the
          world of digital marketing. Ask away!
        </p>
        <p className="leading-normal text-muted-foreground">
          You can start a conversation here or try the following examples:
        </p>
        <div className="mt-4 flex flex-col items-start space-y-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto p-0 text-base"
              onClick={() => setInput(message.message)}
            >
              <IconArrowRight className="mr-2 text-muted-foreground" />
              {message.heading}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
