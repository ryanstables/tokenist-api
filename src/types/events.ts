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

// Server → Client events (GA API names)
export interface ResponseOutputTextDelta extends BaseEvent {
  type: 'response.output_text.delta';
  delta: string;
}

export interface ResponseOutputAudioTranscriptDelta extends BaseEvent {
  type: 'response.output_audio_transcript.delta';
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
      input_token_details?: {
        cached_tokens?: number;
        text_tokens?: number;
        audio_tokens?: number;
      };
      output_token_details?: {
        text_tokens?: number;
        audio_tokens?: number;
      };
    };
  };
}

export interface SessionCreated extends BaseEvent {
  type: 'session.created';
  session: {
    id: string;
    model: string;
    [key: string]: unknown;
  };
}

export type ClientEvent =
  | ConversationItemCreate
  | SessionUpdate
  | ResponseCreate
  | BaseEvent;

export type ServerEvent =
  | ResponseTextDelta
  | ResponseAudioTranscriptDelta
  | ResponseOutputTextDelta
  | ResponseOutputAudioTranscriptDelta
  | ResponseDone
  | SessionCreated
  | BaseEvent;
