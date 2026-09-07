import path from 'path';
import type { CliContext } from './context';
import { COMPLETION_COMMANDS } from './commands';
import { channelNames, loadConfig } from './config';
import { cacheFilePath } from './paths';

export interface CompletionCache {
  updated_at: string;
  channel: string;
  templates: string[];
}

export function loadCompletionCache(ctx: CliContext): CompletionCache | null {
  const filePath = cacheFilePath(ctx);
  if (!ctx.fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(ctx.fs.readFileSync(filePath, 'utf8').toString()) as CompletionCache;
    if (!parsed || !Array.isArray(parsed.templates)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCompletionCache(
  ctx: CliContext,
  channel: string,
  templates: string[],
): void {
  const filePath = cacheFilePath(ctx);
  const parent = path.dirname(filePath);
  ctx.fs.mkdirSync(parent, { recursive: true });
  const body: CompletionCache = {
    updated_at: ctx.now().toISOString(),
    channel,
    templates: [...new Set(templates.filter(Boolean))],
  };
  ctx.fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, {
    encoding: 'utf8',
  });
}

export function completeKind(ctx: CliContext, kind: string): string[] {
  if (kind === 'commands') return [...COMPLETION_COMMANDS];
  if (kind === 'channels') return channelNames(ctx);
  if (kind === 'templates') {
    const cache = loadCompletionCache(ctx);
    const file = loadConfig(ctx);
    if (!cache) return [];
    if (file?.default_channel && cache.channel && cache.channel !== file.default_channel) {
      return cache.templates;
    }
    return cache.templates;
  }
  return [];
}

export function completionScript(shell: string): string {
  const normalized = shell.toLowerCase();
  if (normalized === 'bash') return BASH_SCRIPT;
  if (normalized === 'zsh') return ZSH_SCRIPT;
  if (normalized === 'powershell' || normalized === 'pwsh') return POWERSHELL_SCRIPT;
  throw new Error(`unsupported shell "${shell}" (bash | zsh | powershell)`);
}

const BASH_SCRIPT = `# 1msg bash completion — redirect to a file, then reload the shell
# mkdir -p ~/.local/share/bash-completion/completions
# 1msg completion bash > ~/.local/share/bash-completion/completions/1msg

_1msg() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local roots="init send message template channel me status media group flow webhook user catalog call completion version"
  local message_cmds="send list read react location location-request contact buttons menu carousel product cta address order payment sticker flow"
  local template_cmds="list send add remove"
  local channel_cmds="list use add remove current info status settings mm-lite automation"
  local media_cmds="upload get delete"
  local group_cmds="list create get update delete invite-link"
  local flow_cmds="list create get delete preview publish deprecate metadata assets encryption"
  local webhook_cmds="get set clear"
  local user_cmds="blocked block unblock"
  local catalog_cmds="get set"
  local call_cmds="settings connect pre-accept accept reject hangup"
  local flags="-c --channel --instance-id --base-url --token --json --no-color -h --help -v --version"

  local cmd=""
  local i
  for ((i=1; i<COMP_CWORD; i++)); do
    case "\${COMP_WORDS[i]}" in
      -c|--channel|--instance-id|--base-url|--token) i=$((i+1)) ;;
      --json|--no-color|-h|--help|-v|--version) ;;
      -*) ;;
      *) cmd="\${COMP_WORDS[i]}"; break ;;
    esac
  done

  if [[ "$prev" == "-c" || "$prev" == "--channel" ]]; then
    COMPREPLY=( $(compgen -W "$(1msg __complete channels 2>/dev/null)" -- "$cur") )
    return
  fi
  if [[ "$prev" == "--name" && "$cmd" == "template" ]]; then
    COMPREPLY=( $(compgen -W "$(1msg __complete templates 2>/dev/null)" -- "$cur") )
    return
  fi

  if [[ -z "$cmd" ]]; then
    COMPREPLY=( $(compgen -W "$roots $flags" -- "$cur") )
    return
  fi

  case "$cmd" in
    message) COMPREPLY=( $(compgen -W "$message_cmds $flags" -- "$cur") ) ;;
    template) COMPREPLY=( $(compgen -W "$template_cmds $flags" -- "$cur") ) ;;
    channel)
      if [[ "$prev" == "use" || "$prev" == "remove" ]]; then
        COMPREPLY=( $(compgen -W "$(1msg __complete channels 2>/dev/null)" -- "$cur") )
      else
        COMPREPLY=( $(compgen -W "$channel_cmds $flags" -- "$cur") )
      fi
      ;;
    media) COMPREPLY=( $(compgen -W "$media_cmds $flags" -- "$cur") ) ;;
    group) COMPREPLY=( $(compgen -W "$group_cmds $flags" -- "$cur") ) ;;
    flow) COMPREPLY=( $(compgen -W "$flow_cmds $flags" -- "$cur") ) ;;
    webhook) COMPREPLY=( $(compgen -W "$webhook_cmds $flags" -- "$cur") ) ;;
    user) COMPREPLY=( $(compgen -W "$user_cmds $flags" -- "$cur") ) ;;
    catalog) COMPREPLY=( $(compgen -W "$catalog_cmds $flags" -- "$cur") ) ;;
    call) COMPREPLY=( $(compgen -W "$call_cmds $flags" -- "$cur") ) ;;
    completion) COMPREPLY=( $(compgen -W "bash zsh powershell" -- "$cur") ) ;;
    *) COMPREPLY=( $(compgen -W "$flags" -- "$cur") ) ;;
  esac
}

complete -F _1msg 1msg
`;

const ZSH_SCRIPT = `#compdef 1msg
# 1msg zsh completion — write to ~/.zsh/completions/_1msg and add that dir to fpath

_1msg() {
  local -a roots flags
  roots=(init send message template channel me status media group flow webhook user catalog call completion version)
  flags=(-c --channel --instance-id --base-url --token --json --no-color -h --help -v --version)

  if [[ "$words[CURRENT-1]" == "-c" || "$words[CURRENT-1]" == "--channel" ]]; then
    local -a channels
    channels=(\${(f)"$(1msg __complete channels 2>/dev/null)"})
    _describe 'channel' channels
    return
  fi

  if [[ "$words[2]" == "channel" && ( "$words[3]" == "use" || "$words[3]" == "remove" ) ]]; then
    local -a channels
    channels=(\${(f)"$(1msg __complete channels 2>/dev/null)"})
    _describe 'channel' channels
    return
  fi

  if [[ "$words[2]" == "template" && ( "$words[CURRENT-1]" == "--name" || "$words[3]" == "remove" ) ]]; then
    local -a templates
    templates=(\${(f)"$(1msg __complete templates 2>/dev/null)"})
    _describe 'template' templates
    return
  fi

  case "$words[2]" in
    message) _values 'command' send list read react location location-request contact buttons menu carousel product cta address order payment sticker flow ;;
    template) _values 'command' list send add remove ;;
    channel) _values 'command' list use add remove current info status settings mm-lite automation ;;
    media) _values 'command' upload get delete ;;
    group) _values 'command' list create get update delete invite-link ;;
    flow) _values 'command' list create get delete preview publish deprecate metadata assets encryption ;;
    webhook) _values 'command' get set clear ;;
    user) _values 'command' blocked block unblock ;;
    catalog) _values 'command' get set ;;
    call) _values 'command' settings connect pre-accept accept reject hangup ;;
    completion) _values 'shell' bash zsh powershell ;;
    "") _describe 'command' roots ;;
    *) _describe 'flag' flags ;;
  esac
}

_1msg "$@"
`;

const POWERSHELL_SCRIPT = `# 1msg PowerShell completion
Register-ArgumentCompleter -Native -CommandName 1msg -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $cmd = $commandAst.CommandElements | ForEach-Object { $_.Extent.Text }
  $prev = if ($cmd.Count -ge 2) { $cmd[-2] } else { '' }
  $roots = @('init','send','message','template','channel','me','status','media','group','flow','webhook','user','catalog','call','completion','version')
  if ($prev -eq '-c' -or $prev -eq '--channel' -or ($cmd -contains 'use') -or ($cmd -contains 'remove' -and $cmd -contains 'channel')) {
    & 1msg __complete channels 2>$null | Where-Object { $_ -like "$wordToComplete*" }
    return
  }
  if ($cmd -contains 'template' -and $prev -eq '--name') {
    & 1msg __complete templates 2>$null | Where-Object { $_ -like "$wordToComplete*" }
    return
  }
  $roots | Where-Object { $_ -like "$wordToComplete*" }
}
`;
