"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  content: string;
  role: string;
  createdAt: Date;
}

interface MessageViewerProps {
  messages: Message[];
}

export default function MessageViewer({ messages }: MessageViewerProps) {
  if (messages.length === 0) {
    return <p className="text-gray-500">No messages yet</p>;
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`p-4 rounded-lg ${
            message.role === "user"
              ? "bg-blue-50 border-l-4 border-blue-500"
              : "bg-gray-50 border-l-4 border-gray-500"
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <span className="font-semibold capitalize">{message.role}</span>
            <span className="text-sm text-gray-500">
              {message.createdAt.toLocaleString()}
            </span>
          </div>
          {message.role === "assistant" ? (
            <div className="prose prose-sm max-w-none prose-pre:bg-gray-800 prose-pre:text-gray-100 prose-code:text-pink-600">
              <Markdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </Markdown>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}
        </div>
      ))}
    </div>
  );
}
