import { App, Modal, Notice, Setting } from 'obsidian';

export interface ConfirmationModalOptions {
  title: string;
  message: string;
  warningText?: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => Promise<void>;
}

export class ConfirmationModal extends Modal {
  constructor(
    app: App,
    private readonly options: ConfirmationModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.options.title });
    contentEl.createEl('p', { text: this.options.message });

    if (this.options.warningText) {
      const warning = contentEl.createEl('p', { text: this.options.warningText });
      warning.addClass('mod-warning');
    }

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText(this.options.cancelText ?? 'Cancel')
          .onClick(() => this.close());
      })
      .addButton((button) => {
        button
          .setWarning()
          .setButtonText(this.options.confirmText)
          .onClick(async () => {
            button.setDisabled(true);
            try {
              await this.options.onConfirm();
              this.close();
            } catch (error) {
              new Notice(
                `Ownly: ${error instanceof Error ? error.message : String(error)}`,
              );
              button.setDisabled(false);
            }
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
