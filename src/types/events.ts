// OpenAI Realtime API event types

export interface BaseEvent {
  type: string;
  event_id?: string;
}

// Client → Server events
export interface ConversationItemCreate extends BaseEvent {
  type: 'conversation.item.create';
  item: {
    type: 'message' | 'function_call' | 'function_call_output';
    role?: 'user' | 'assistant' | 'system';
    content?: Array<{
      type: 'input_text' | 'input_audio' | 'text' | 'audio';
      text?: string;
      audio?: string;
      transcript?: string;
    }>;
  };
}

export interface SessionUpdate extends BaseEvent {
  type: 'session.update';
  session: {
    instructions?: string;
    [key: string]: unknown;
  };
}

export interface ResponseCreate extends BaseEvent {
  type: 'response.create';
  response?: {
    instructions?: string;
    [key: string]: unknown;
  };
}

// Server → Client events (Beta API names)
export interface ResponseTextDelta extends BaseEvent {
  type: 'response.text.delta';
  delta: string;
}

export interface ResponseAudioTranscriptDelta extends BaseEvent {
  type: 'response.audio_transcript.delta';
  delta: string;
}

export interface ResponseDone extends BaseEvent {
  type: 'response.done';
  response: {
    id: string;
    status: string;
    usage?: {
      total_tokens: number;
      input_tokens: number;
      output_tokens: number;
      // Realtime API format
      input_token_details?: {
        cached_tokens?: number;
        text_tokens?: number;
        audio_tokens?: number;
        image_tokens?: number;
        cached_tokens_details?: {
          text_tokens?: number;
          audio_tokens?: number;
          image_tokens?: number;
        };
      };
      output_token_details?: {
        text_tokens?: number;
        audio_tokens?: number;
        reasoning_tokens?: number;
      };
      // Chat Completions API format
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
        text_tokens?: number;
        audio_tokens?: number;
        image_tokens?: number;
      };
      completion_tokens_details?: {
        text_tokens?: number;
        audio_tokens?: number;
        reasoning_tokens?: number;
        accepted_prediction_tokens?: number;
        rejected_prediction_tokens?: number;
      };
    };
  };
}

export interface ResponseFunctionCallArgumentsDelta extends BaseEvent {
  type: 'response.function_call_arguments.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  delta: string;
}

export interface ResponseFunctionCallArgumentsDone extends BaseEvent {
  type: 'response.function_call_arguments.done';
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  arguments: string;
}

export interface SessionCreated extends BaseEvent {
  type: 'session.created';
  session: {
    id: string;
    model: string;
    [key: string]: unknown;
  };
}

export interface RateLimitsUpdated extends BaseEvent {
  type: 'rate_limits.updated';
  rate_limits: Array<{
    name: string;
    limit: number;
    remaining: number;
    reset_seconds: number;
  }>;
}

export type ClientEvent =
  | ConversationItemCreate
  | SessionUpdate
  | ResponseCreate
  | BaseEvent;

export type ServerEvent =
  | ResponseTextDelta
  | ResponseAudioTranscriptDelta
  | ResponseFunctionCallArgumentsDelta
  | ResponseFunctionCallArgumentsDone
  | ResponseDone
  | SessionCreated
  | RateLimitsUpdated
  | BaseEvent;
