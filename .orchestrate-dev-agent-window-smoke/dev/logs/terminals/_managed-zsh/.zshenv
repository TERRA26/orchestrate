# T3 Code zsh env wrapper
_t3code_home="${T3CODE_ORIGINAL_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_t3code_home"
[[ -f "$_t3code_home/.zshenv" ]] && source "$_t3code_home/.zshenv"
export ZDOTDIR='/Users/christophe/Documents/Orchestrate/orchestrate/.orchestrate-dev-agent-window-smoke/dev/logs/terminals/_managed-zsh'
