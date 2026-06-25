// Заглушка для статических ассетов (png/svg/jpg...) в jest — иначе он парсит
// бинарник как JS и падает с SyntaxError. См. jest.config.js moduleNameMapper.
module.exports = 'test-file-stub';
