#!/bin/bash

# Script de mise à jour rapide sans confirmation
# Usage: ./quick-update.sh "message de commit"

set -e

# Message par défaut si non fourni
MESSAGE="${1:-feat: mise à jour automatique orchestrateur $(date '+%Y-%m-%d %H:%M')}"

echo "🚀 Mise à jour automatique en cours..."

# Ajouter tous les fichiers modifiés
git add .

# Commit avec message
git commit -m "$MESSAGE

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push vers la branche courante
git push

echo "✅ Mise à jour terminée et pushée sur GitHub!"