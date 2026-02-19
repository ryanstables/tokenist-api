import { getEncoding, Tiktoken } from 'js-tiktoken';
import {
  BaseEvent,
  ConversationItemCreate,
  SessionUpdate,
  ResponseCreate,
  ResponseTextDelta,
  ResponseAudioTranscriptDelta,
  ResponseDone,
} from '../types/events';

let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = getEncoding('cl100k_base');
  }
  return encoder;
}

export function countTokens(text: string): number {
  if (!text) return 0;
  return getEncoder().encode(text).length;
}

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
}

export function estimateClientMessageTokens(data: string): TokenEstimate {
  try {
    const event = JSON.parse(data) as BaseEvent;
    let inputTokens = 0;

    switch (event.type) {
      case 'conversation.item.create': {
        const createEvent = event as ConversationItemCreate;
        if (createEvent.item?.content) {
          for (const content of createEvent.item.content) {
            if (content.text) {
              inputTokens += countTokens(content.text);
            }
            if (content.transcript) {
              inputTokens += countTokens(content.transcript);
            }
          }
        }
        break;
      }

      case 'session.update': {
        const updateEvent = event as SessionUpdate;
        if (updateEvent.session?.instructions) {
          inputTokens += countTokens(updateEvent.session.instructions);
        }
        break;
      }

      case 'response.create': {
        const responseEvent = event as ResponseCreate;
        if (responseEvent.response?.instructions) {
          inputTokens += countTokens(responseEvent.response.instructions);
        }
        break;
      }
    }

    return { inputTokens, outputTokens: 0 };
  } catch {
    return { inputTokens: 0, outputTokens: 0 };
  }
}

export function estimateUpstreamMessageTokens(data: string): TokenEstimate {
  try {
    const event = JSON.parse(data) as BaseEvent;
    let outputTokens = 0;

    switch (event.type) {
      // Beta API event names
      case 'response.text.delta': {
        const delta = (event as ResponseTextDelta).delta;
        if (delta) {
          outputTokens += countTokens(delta);
        }
        break;
      }

      case 'response.audio_transcript.delta': {
        const delta = (event as ResponseAudioTranscriptDelta).delta;
        if (delta) {
          outputTokens += countTokens(delta);
        }
        break;
      }

      // response.done can have actual usage from OpenAI
      case 'response.done': {
        const doneEvent = event as ResponseDone;
        if (doneEvent.response?.usage) {
          return {
            inputTokens: 0,
            outputTokens: 0,
          };
        }
        break;
      }
    }

    return { inputTokens: 0, outputTokens };
  } catch {
    return { inputTokens: 0, outputTokens: 0 };
  }
}

export interface TokenDetails {
  textTokens?: number;
  audioTokens?: number;
  cachedTokens?: number;
  imageTokens?: number;
  reasoningTokens?: number;
}

export interface ResponseUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputTokenDetails?: TokenDetails;
  outputTokenDetails?: TokenDetails;
}

export function extractResponseUsage(data: string): ResponseUsage | null {
  try {
    const event = JSON.parse(data) as BaseEvent;

    if (event.type === 'response.done') {
      const doneEvent = event as ResponseDone;
      const usage = doneEvent.response?.usage;
      if (usage) {
        const result: ResponseUsage = {
          inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
          outputTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        };

        // Extract input token details (Realtime: input_token_details, Chat: prompt_tokens_details)
        const inputDetails = usage.input_token_details ?? usage.prompt_tokens_details;
        if (inputDetails) {
          result.inputTokenDetails = {
            textTokens: inputDetails.text_tokens,
            audioTokens: inputDetails.audio_tokens,
            cachedTokens: inputDetails.cached_tokens,
            imageTokens: inputDetails.image_tokens,
          };
        }

        // Extract output token details (Realtime: output_token_details, Chat: completion_tokens_details)
        const outputDetails = usage.output_token_details ?? usage.completion_tokens_details;
        if (outputDetails) {
          result.outputTokenDetails = {
            textTokens: outputDetails.text_tokens,
            audioTokens: outputDetails.audio_tokens,
            reasoningTokens: outputDetails.reasoning_tokens,
          };
        }

        return result;
      }
    }

    return null;
  } catch {
    return null;
  }
}
