import { expect, type Page } from '@playwright/test'

export async function openPanel(page: Page, name: string) {
	await page.getByRole('tab', { name, exact: true }).click()
	await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	)
}
export async function selectChoice(page: Page, label: string, value: string) {
	await page.getByLabel(label, { exact: true }).click()
	await page.getByRole('listbox').getByTestId(`choice-${value}`).click()
}
