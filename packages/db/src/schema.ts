import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ===== Enums =====
export const agentExecutionStatusEnum = pgEnum("agent_execution_status", [
  "running",
  "success",
  "error",
]);

export const gmailMessageStatusEnum = pgEnum("gmail_message_status", [
  "pending",
  "replied",
  "skipped",
  "dismissed",
]);

export const gmailOutgoingStatusEnum = pgEnum("gmail_outgoing_status", [
  "draft",
  "sent",
  "cancelled",
]);

export const inboxTaskStatusEnum = pgEnum("inbox_task_status", [
  "pending",
  "queued",
  "running",
  "completed",
  "failed",
  "rejected",
  "waiting",
]);

export const snsPostStatusEnum = pgEnum("sns_post_status", [
  "draft",
  "proposed",
  "script_proposed",
  "generating",
  "metadata_approved",
  "content_approved",
  "approved",
  "rendering",
  "image_ready",
  "rendered",
  "scheduled",
  "publishing",
  "published",
  "skipped",
  "failed",
  "processing",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "running",
  "success",
  "error",
]);

export const todoStatusEnum = pgEnum("todo_status", ["pending", "completed"]);

export const knowledgeStatusEnum = pgEnum("knowledge_status", [
  "active",
  "archived",
]);

// sessions テーブル
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: varchar("session_id", { length: 255 }).notNull(),
    slackChannel: varchar("slack_channel", { length: 255 }),
    slackThreadTs: varchar("slack_thread_ts", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sessions_session_id_idx").on(table.sessionId),
    index("sessions_slack_thread_ts_idx").on(table.slackThreadTs),
  ],
);

// messages テーブル
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => sessions.id)
      .notNull(),
    content: text("content").notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_session_id_idx").on(table.sessionId),
    index("messages_created_at_idx").on(table.createdAt),
  ],
);

// tasks テーブル
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => sessions.id)
      .notNull(),
    toolName: varchar("tool_name", { length: 255 }).notNull(),
    toolInput: jsonb("tool_input"),
    toolResult: jsonb("tool_result"),
    durationMs: integer("duration_ms"),
    status: taskStatusEnum().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("tasks_session_id_idx").on(table.sessionId)],
);

// knowledges テーブル
export const knowledges = pgTable(
  "knowledges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    content: text("content").notNull(),
    status: knowledgeStatusEnum().notNull().default("active"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("knowledges_name_idx").on(table.name)],
);

// agents テーブル
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  schedule: varchar("schedule", { length: 255 }),
  config: jsonb("config"),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// agent_executions テーブル
export const agentExecutions = pgTable(
  "agent_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    sessionId: uuid("session_id").references(() => sessions.id),
    status: agentExecutionStatusEnum().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    output: jsonb("output"),
  },
  (table) => [
    index("agent_executions_agent_id_idx").on(table.agentId),
    index("agent_executions_started_at_idx").on(table.startedAt),
  ],
);

// lessons テーブル（エピソード記憶）
export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => sessions.id)
      .notNull(),
    taskId: uuid("task_id").references(() => tasks.id),
    toolName: varchar("tool_name", { length: 255 }).notNull(),
    errorPattern: text("error_pattern").notNull(),
    reflection: text("reflection").notNull(),
    resolution: text("resolution"),
    severity: varchar("severity", { length: 50 }).notNull().default("medium"),
    tags: jsonb("tags").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("lessons_session_id_idx").on(table.sessionId)],
);

// gmail_tokens テーブル
export const gmailTokens = pgTable("gmail_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// gmail_messages テーブル
export const gmailMessages = pgTable(
  "gmail_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gmailId: varchar("gmail_id", { length: 255 }).notNull().unique(),
    threadId: varchar("thread_id", { length: 255 }).notNull(),
    fromAddress: varchar("from_address", { length: 500 }).notNull(),
    subject: varchar("subject", { length: 1000 }).notNull(),
    classification: varchar("classification", { length: 50 }).notNull(),
    status: gmailMessageStatusEnum().notNull().default("pending"),
    draftReply: text("draft_reply"),
    slackMessageTs: varchar("slack_message_ts", { length: 255 }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("gmail_messages_thread_id_idx").on(table.threadId),
    index("gmail_messages_status_idx").on(table.status),
  ],
);

// inbox_tasks テーブル（Inbox Agent）
export const inboxTasks = pgTable(
  "inbox_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intent: varchar("intent", { length: 50 }).notNull(),
    autonomyLevel: integer("autonomy_level").notNull(),
    summary: text("summary").notNull(),
    slackChannel: varchar("slack_channel", { length: 255 }).notNull(),
    slackMessageTs: varchar("slack_message_ts", { length: 255 }).notNull(),
    slackThreadTs: varchar("slack_thread_ts", { length: 255 }),
    approvalChannel: varchar("approval_channel", { length: 255 }),
    approvalMessageTs: varchar("approval_message_ts", { length: 255 }),
    status: inboxTaskStatusEnum().notNull().default("pending"),
    originalMessage: text("original_message").notNull(),
    executionPrompt: text("execution_prompt").notNull(),
    sessionId: varchar("session_id", { length: 255 }),
    result: text("result"),
    costUsd: numeric("cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("inbox_tasks_status_idx").on(table.status)],
);

// Type inference
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Knowledge = typeof knowledges.$inferSelect;
export type NewKnowledge = typeof knowledges.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type AgentExecution = typeof agentExecutions.$inferSelect;
export type NewAgentExecution = typeof agentExecutions.$inferInsert;

export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;

export type GmailToken = typeof gmailTokens.$inferSelect;
export type NewGmailToken = typeof gmailTokens.$inferInsert;

export type GmailMessageRecord = typeof gmailMessages.$inferSelect;
export type NewGmailMessage = typeof gmailMessages.$inferInsert;

export type InboxTask = typeof inboxTasks.$inferSelect;
export type NewInboxTask = typeof inboxTasks.$inferInsert;

// daily_plans テーブル（デイリープランナー）
export const dailyPlans = pgTable("daily_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: varchar("date", { length: 10 }).notNull().unique(), // YYYY-MM-DD
  slackChannel: varchar("slack_channel", { length: 255 }).notNull(),
  slackMessageTs: varchar("slack_message_ts", { length: 255 }),
  blocks: jsonb("blocks"), // Block Kit ブロック配列
  rawData: jsonb("raw_data"), // 収集した生データ（再生成用）
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type DailyPlan = typeof dailyPlans.$inferSelect;
export type NewDailyPlan = typeof dailyPlans.$inferInsert;

// snsPosts テーブル（SNS Manager）
export const snsPosts = pgTable(
  "sns_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: varchar("platform", { length: 20 }).notNull(),
    postType: varchar("post_type", { length: 20 }).notNull(),
    content: jsonb("content").notNull(),
    status: snsPostStatusEnum().notNull().default("draft"),
    slackChannel: varchar("slack_channel", { length: 50 }),
    slackMessageTs: varchar("slack_message_ts", { length: 50 }),
    publishedUrl: varchar("published_url", { length: 500 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    currentPhase: varchar("current_phase", { length: 20 }),
    phaseArtifacts: jsonb("phase_artifacts"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sns_posts_status_idx").on(table.status),
    index("sns_posts_platform_idx").on(table.platform),
  ],
);

export type SnsPost = typeof snsPosts.$inferSelect;
export type NewSnsPost = typeof snsPosts.$inferInsert;

// tiktok_tokens テーブル
export const tiktokTokens = pgTable("tiktok_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  openId: varchar("open_id", { length: 255 }).notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }).notNull(),
  scopes: text("scopes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type TiktokToken = typeof tiktokTokens.$inferSelect;
export type NewTiktokToken = typeof tiktokTokens.$inferInsert;

// todos テーブル（ユーザー ToDo）
export const todos = pgTable("todos", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }),
  status: todoStatusEnum().notNull().default("pending"),
  slackChannel: varchar("slack_channel", { length: 255 }).notNull(),
  slackMessageTs: varchar("slack_message_ts", { length: 255 }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;

// personal_notes テーブル（Personal Knowledge）
export const personalNotes = pgTable(
  "personal_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    path: varchar("path", { length: 500 }).notNull().unique(),
    category: varchar("category", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    content: text("content").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("personal_notes_category_idx").on(table.category)],
);

export type PersonalNote = typeof personalNotes.$inferSelect;
export type NewPersonalNote = typeof personalNotes.$inferInsert;

// gmail_outgoing テーブル（メール新規送信ドラフト）
export const gmailOutgoing = pgTable("gmail_outgoing", {
  id: uuid("id").primaryKey().defaultRandom(),
  toAddress: varchar("to_address", { length: 500 }).notNull(),
  subject: varchar("subject", { length: 1000 }).notNull(),
  body: text("body").notNull(),
  status: gmailOutgoingStatusEnum().notNull().default("draft"),
  slackMessageTs: varchar("slack_message_ts", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export type GmailOutgoing = typeof gmailOutgoing.$inferSelect;
export type NewGmailOutgoing = typeof gmailOutgoing.$inferInsert;

// ===== Relations =====

export const sessionsRelations = relations(sessions, ({ many }) => ({
  messages: many(messages),
  tasks: many(tasks),
  lessons: many(lessons),
  agentExecutions: many(agentExecutions),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  session: one(sessions, {
    fields: [tasks.sessionId],
    references: [sessions.id],
  }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
  session: one(sessions, {
    fields: [lessons.sessionId],
    references: [sessions.id],
  }),
  task: one(tasks, {
    fields: [lessons.taskId],
    references: [tasks.id],
  }),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  executions: many(agentExecutions),
}));

export const agentExecutionsRelations = relations(
  agentExecutions,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentExecutions.agentId],
      references: [agents.id],
    }),
    session: one(sessions, {
      fields: [agentExecutions.sessionId],
      references: [sessions.id],
    }),
  }),
);
