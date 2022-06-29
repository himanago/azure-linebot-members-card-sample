module.exports = async function (context, item) {
  context.bindings.accountDocument = JSON.stringify(item);
};