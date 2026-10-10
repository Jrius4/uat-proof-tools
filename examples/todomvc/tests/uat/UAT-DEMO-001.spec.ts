import { test, expect } from './_uat';

test('UAT-DEMO-001: Add and complete a to-do', async ({ page, uat }) => {
  await uat.step('s1', 'Open the to-do app', async () => {
    await page.goto(process.env.BASE_URL!);
    await expect(page.getByPlaceholder('What needs to be done?')).toBeVisible();
  }, { holdMs: 1200 });

  await uat.step('s2', 'Add "Book flights"', async () => {
    await page.getByPlaceholder('What needs to be done?').fill('Book flights');
    await page.getByPlaceholder('What needs to be done?').press('Enter');
  });

  await uat.step('s3', 'Tick "Book flights"', async () => {
    await page.getByTestId('todo-item').filter({ hasText: 'Book flights' }).getByRole('checkbox').check();
  });

  await uat.check('e1', 'Book flights is completed', async () => {
    await expect(page.getByTestId('todo-item').filter({ hasText: 'Book flights' })).toHaveClass(/completed/);
  });

  await uat.check('e2', '0 items left', async () => {
    await expect(page.getByTestId('todo-count')).toContainText('0 items left');
  });
});
