import { DASHBOARD_LIMITS, isDashboardBlocks } from "@openbot/contracts/ipc";
import { sourceText } from "@openbot/i18n/source";
import { Effect } from "effect";
import { z } from "zod";
import { type DashboardActor, DashboardOperationFailed, type DashboardService } from "../dashboards/dashboard-service";
import { openBotToolFailure, openBotToolResult } from "./routine-tools";
import { toolStep } from "./tool-operation";

const id = z.string().min(1).max(256);
const revision = z.number().int().positive();
const blocks = z
  .array(z.object({}).catchall(z.unknown()))
  .max(DASHBOARD_LIMITS.blocks)
  .refine(isDashboardBlocks, "Invalid dashboard blocks.");
const create = z.strictObject({ title: z.string().trim().min(1).max(DASHBOARD_LIMITS.title), blocks });
const read = z.strictObject({ id });
const update = z.strictObject({ id, revision, ...create.shape });
const archive = z.strictObject({ id, revision });
const BLOCK_GUIDANCE = [
  "Choose a built-in widget type, size, and structured data. Never design a UI or send HTML, CSS, JavaScript, arbitrary styles, shell actions, or plugin code. Blocks have stable id, title, type. Optional presentation is {size:S|M|L|XL|FULL,tone:surface|lavender|mustard|sky|green,state?:ready|loading|empty|error,message?,badge?,visibleCount?}; sizes span 3,4,6,8,12 columns in a 12-column grid. Default ready; only set another state when that state is part of the report. footer? is {agent?,source?,updatedAt:ISO?}; agent is a display label, never an access grant. detail? is {meta?:[{label,value}],history?:[{at:ISO,agent,text}]}; history is agent-reported content, not an audit log.",
  "Types: stat {label,value:string,unit?,trend?:{direction:up|down|flat,value:string},caption?,history?:[{at,value:number,delta?}],periods?,target?}; stat-group {items:[stat fields],2-6}; text {text,heading?,bodyFull?,sources?:[{label,url}]}; metric {value:string,description?} remains available.",
  "list {items:[{id,title,subtitle?,meta?,lead?:{type:agent|icon,value:string},action?,group?,at:ISO?,url?}],total?}; news {items:[{id,category,source,headline,summary,url,summaryFull?,publishedAt:ISO?,sources?:[{label,url}]}],categories?}; checklist {items:[{id,text,checked,meta?,category?,quantity:number?,unit?,source?:recipe|chat,checkedAt:ISO|null?}],allowAdd?,groupsOrder?,sharedWith?}. Use text, not label, on checklist items.",
  "progress {label,value:0-100,unit?,caption?}; project {ref?,progress:0-100,tasks:[checklist item plus status?:todo|doing|waiting|done,assignee?],activity?:[{agent,text,at:ISO}],links?:[{label,url}],repoUrl?}; timeline {dateLabel,events:[{id,time,title,agent?,status?,duration:number?,location?,detail?,routineId?,selected?}],note?,date:ISO?,hours?:{from:0-24,to:0-24}}; week {days:[{weekday,date:ISO,today:boolean,events:timeline events}],range?:{start:ISO,end:ISO,mode:week|month}}.",
  "weather {location,temp:number,condition,min:number,max:number,hourly:[{time,temp:number,condition?}] up to24,daily?:[{day,condition,min,max,precip?}] up to7,feelsLike?,wind?}; callout {eyebrow,headline,body?,bodyFull?,action?,related?:[{title,subtitle?,at:ISO?}]}; rich {heading?,media?:{icon?,imageUrl?},meta?,sections:[{index:number,text}],action?,portions?:1-1000,ingredients?:[{id?,label,quantity:number,unit?,category?}],steps?:[{index:number,text,timerSec?}],nutrition?:{kcal,protein},targetChecklistId?}. The target checklist is a block in the same dashboard.",
  "table {columns:string[],rows:string[][],columnMeta?:[{key,label,align:left|center|right}],rowIds?,sort?:{key,dir:asc|desc},page?:{index,size,total},exportable?}; chart {chartType:line|bar|donut,points:[{label,value:number,tone?,note?}],periods?,activePeriod?,series?:[{label,points:[{x:string,y:number,note?}]}],axisLabels?,highlight?,valuesTable?:{columns,rows}}. Donut allows at most5 points.",
  "media {imageUrl,caption?,alt?,width?,height?,source?}; actions {heading,status?:{label,tone},description?,buttons:[action] up to12,schedule?,steps?:string[],runs?:[{at:ISO,status,durationMs?,trigger?,outputRef?}]}; action is {label,icon?,target:{type:chat}|{type:routine,routineId}|{type:url,url}}. Actions run only after a user click. All URLs must be HTTP(S), without credentials; icons are lowercase icon names. Never use a file URL or command.",
  "calendar {entries:[{id,title,startsAt:ISO,endsAt:ISO?,detail?}]} and detail {content:{text,metrics:[{label,value}],items:string[]}} remain available. report {routineId} shows your existing routine's saved answer without another generation; get its id from list_routines. Use at most64 blocks, 200 items per collection, 24 table columns, and 256KiB of UTF-8 JSON per block array. Keep existing checklist item IDs and checked values on updates.",
].join(" ");
export const DASHBOARD_TOOL_DEFINITIONS = [
  {
    name: "list_dashboards",
    description: "List your saved dashboards. The Dashboards plugin must be installed on this host.",
    shape: {},
  },
  {
    name: "read_dashboard",
    description: "Read your dashboard and its current revision before an update.",
    shape: read.shape,
  },
  {
    name: "create_dashboard",
    description: `Create a dashboard for your agent. ${BLOCK_GUIDANCE}`,
    shape: create.shape,
  },
  {
    name: "update_dashboard",
    description: `Replace your dashboard title and blocks using its current revision. On conflict, read again and preserve the latest checklist state. ${BLOCK_GUIDANCE}`,
    shape: update.shape,
  },
  {
    name: "archive_dashboard",
    description: "Archive your dashboard using its current revision. Saved data is retained.",
    shape: archive.shape,
  },
];
export const handleDashboardTool = Effect.fn("DashboardTools.handle")(function* (
  tool: string,
  args: unknown,
  agentId: string,
  service: DashboardService | null,
) {
  if (!DASHBOARD_TOOL_DEFINITIONS.some((definition) => definition.name === tool)) return null;
  if (!service) return openBotToolFailure(sourceText("error.dashboard.unavailable"));
  const actor: DashboardActor = {
    administrator: false,
    canReadAgent: (id) => id === agentId,
    canWriteAgent: (id) => id === agentId,
  };
  const operation = Effect.gen(function* () {
    switch (tool) {
      case "list_dashboards":
        return yield* service.list({ agentId }, actor);
      case "read_dashboard":
        return yield* service.read((yield* toolStep(() => read.parse(args))).id, actor);
      case "archive_dashboard":
        return yield* service.archive(yield* toolStep(() => archive.parse(args)), actor);
      case "create_dashboard": {
        const input = yield* toolStep(() => create.parse(args));
        if (!isDashboardBlocks(input.blocks)) return yield* Effect.fail(new Error("Invalid dashboard blocks."));
        return yield* service.create({ ...input, blocks: input.blocks, agentId }, actor);
      }
      default: {
        const input = yield* toolStep(() => update.parse(args));
        if (!isDashboardBlocks(input.blocks)) return yield* Effect.fail(new Error("Invalid dashboard blocks."));
        return yield* service.update({ ...input, blocks: input.blocks }, actor);
      }
    }
  });
  return yield* operation.pipe(
    Effect.map(openBotToolResult),
    Effect.catch((error) =>
      Effect.succeed(
        openBotToolFailure(
          error instanceof DashboardOperationFailed ? error.message : sourceText("error.dashboard.invalid"),
        ),
      ),
    ),
  );
});
